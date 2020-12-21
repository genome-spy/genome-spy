import { color as d3color } from "d3-color";
import { format } from "d3-format";
import { fastmap, isString, accessor } from "vega-util";
import { primaryChannel } from "../encoder/encoder";
import { isContinuous } from "vega-scale";
import { fp64ify } from "./includes/fp64-utils";
import Interval from "../utils/interval";
import { SHAPES } from "../marks/pointMark"; // Circular dependency, TODO: Fix
import ArrayBuilder from "./arrayBuilder";
import { ATTRIBUTE_PREFIX } from "../scale/glslScaleGenerator";
import getMetrics, { SDF_PADDING } from "../utils/bmFontMetrics";

/*
 * TODO: Optimize constant values: compile them dynamically into vertex shader
 */

// https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Constants
const glConst = {
    POINTS: 0x0000,
    TRIANGLES: 0x0004,
    TRIANGLE_STRIP: 0x0005,
    STATIC_DRAW: 0x88e4
};

function color2floatArray(color) {
    if (!color) {
        return [0.9, 0.9, 0.9]; // TODO: Configurable NA color
    } else if (isString(color)) {
        color = d3color(color);
    }
    return new Float32Array([
        color.r / 255.0,
        color.g / 255.0,
        color.b / 255.0
    ]);
}

function createCachingColor2floatArray() {
    const cache = fastmap();

    return color => {
        if (isString(color) && cache.size < 30) {
            let value = cache.get(color);
            if (value) {
                return value;
            }
            value = color2floatArray(color);
            cache.set(color, value);
            return value;
        }
        return color2floatArray(color);
    };
}

/**
 * @typedef {object} RangeEntry Represents a location of a vertex subset
 * @prop {number} offset in vertices
 * @prop {number} count in vertices
 *
 * @typedef {import("./arraybuilder").Converter} Converter
 * @typedef {import("../encoder/encoder").Encoder} Encoder
 * @typedef {import("../marks/mark").AttributeProps} AttributeProps
 */
export class VertexBuilder {
    /**
     *
     * @param {object} object
     * @param {Record<string, Encoder>} object.encoders
     * @param {Record<string, Converter>} [object.converters]
     * @param {Record<string, AttributeProps>} [object.attributes]
     * @param {number} [object.numVertices] If the number of data items is known, a
     *      preallocated TypedArray is used
     */
    constructor({
        encoders,
        converters = {},
        numVertices = undefined,
        attributes
    }) {
        this.encoders = encoders;
        this.allocatedVertices = numVertices;

        const e = /** @type {Object.<string, import("../encoder/encoder").NumberEncoder>} */ (encoders);

        const c2f = createCachingColor2floatArray();

        /** @type {Record<string, Converter>} */
        this.converters = {
            color: { f: d => c2f(e.color(d)), numComponents: 3 },
            ...converters
        };

        // Here's some complexity because of constants. They can be collapsed into a single
        // element in the WebGL buffers - expect in the case of complex geometries (rect mark)
        // where different channels map to different vertices.

        const rawChannels = Object.entries(attributes)
            .filter(([channel, attributeProps]) => attributeProps.raw)
            .map(([channel, attributeProps]) => channel);

        for (const channel of rawChannels) {
            const ce = encoders[channel];
            if (ce) {
                if (ce.scale) {
                    // TODO: nominal/ordinal that are numeric should go raw as well
                    const f = isContinuous(ce.scale.type)
                        ? ce.accessorWithModifier
                        : ce;
                    const fp64 = ce.scale.fp64;
                    const double = new Float32Array(2);
                    this.converters[channel] = {
                        f: fp64 ? d => fp64ify(f(d), double) : f,
                        numComponents: fp64 ? 2 : 1,
                        raw: true
                    };
                } else {
                    // No scale, it's a "value".
                    this.converters[channel] = {
                        f: ce,
                        numComponents: 1,
                        raw: true
                    };
                }
            }
        }

        /**
         * Is the channel complex, i.e. resulting multiple vertices for a single datum
         * @param {string} channel
         */
        const isComplexChannel = channel => {
            channel = primaryChannel(channel);
            return attributes[channel] && attributes[channel].complexGeometry;
        };

        /** @param {function(string, Encoder):boolean} encodingPredicate */
        const getAttributes = encodingPredicate =>
            Object.entries(encoders)
                .filter(([channel, encoder]) => attributes[channel])
                .filter(([channel, encoder]) =>
                    encodingPredicate(channel, encoder)
                )
                .map(([channel, encoding]) => channel);

        /** @type {function(string, Encoder):boolean} */
        const isConstant = (channel, encoder) =>
            encoder.constant && !isComplexChannel(channel);

        // Raw constants are included in the generated glsl code and thus skipped here
        const constants = getAttributes(
            (channel, encoder) =>
                isConstant(channel, encoder) && !attributes[channel].raw
        );

        const variables = getAttributes(
            (channel, encoder) => !isConstant(channel, encoder)
        );

        this.variableBuilder = ArrayBuilder.create(
            this.converters,
            variables,
            numVertices
        );
        this.constantBuilder = ArrayBuilder.create(this.converters, constants);

        // Update all constants with an empty datum
        this.constantBuilder.updateFromDatum({});
        this.constantBuilder.pushAll();

        /** Vertex index */
        this.index = 0;

        /** @type {Map<string, RangeEntry>} keep track of sample locations within the vertex array */
        this.rangeMap = new Map();
    }

    /**
     *
     * @param {String} key
     * @param {object[]} points
     */
    addBatch(key, points) {
        const offset = this.index;

        for (const p of points) {
            this.variableBuilder.pushFromDatum(p);
            this.index++;
        }

        const count = this.index - offset;
        if (count) {
            this.rangeMap.set(key, {
                offset,
                count
                // TODO: Add some indices that allow rendering just a range
            });
        }
    }

    toArrays() {
        return {
            /** @type {Record<string, {data: number[] | Float32Array, numComponents: number, divisor?: number}>} */
            arrays: {
                ...this.variableBuilder.arrays,
                ...this.constantBuilder.toValues()
            },
            /** Number of vertices used */
            vertexCount: this.variableBuilder.vertexCount,
            /** Number of vertices allocated in buffers */
            allocatedVertices: this.allocatedVertices,
            rangeMap: this.rangeMap,
            // TODO: better name for "componentNumbers"
            componentNumbers: Object.fromEntries(
                Object.entries(this.converters).map(e => [
                    e[0],
                    (e[1] && e[1].numComponents) || undefined // TODO: Check
                ])
            )
        };
    }
}

export class RectVertexBuilder extends VertexBuilder {
    /**
     *
     * @param {Object} object
     * @param {Record<string, Encoder>} object.encoders
     * @param {Record<string, AttributeProps>} object.attributes
     * @param {number} [object.tesselationThreshold]
     *     If the rect is wider than the threshold, tesselate it into pieces
     * @param {number[]} [object.visibleRange]
     * @param {number} [object.numItems] Number of data items
     */
    constructor({
        encoders,
        attributes,
        tesselationThreshold = Infinity,
        visibleRange = [-Infinity, Infinity],
        numItems
    }) {
        super({
            encoders,
            converters: {
                x: undefined,
                y: undefined,
                x2: undefined,
                y2: undefined
            },
            attributes,
            numVertices:
                tesselationThreshold == Infinity ? numItems * 6 : undefined
        });

        this.visibleRange = visibleRange;

        this.tesselationThreshold = tesselationThreshold || Infinity;

        this.updateX = this.variableBuilder.createUpdater(
            ATTRIBUTE_PREFIX + "x",
            1
        );
        this.updateX2 = this.variableBuilder.createUpdater(
            ATTRIBUTE_PREFIX + "x2",
            1
        );
        this.updateY = this.variableBuilder.createUpdater(
            ATTRIBUTE_PREFIX + "y",
            1
        );
        this.updateY2 = this.variableBuilder.createUpdater(
            ATTRIBUTE_PREFIX + "y2",
            1
        );

        this.updateXFrac = this.variableBuilder.createUpdater("xFrac", 1);
        this.updateYFrac = this.variableBuilder.createUpdater("yFrac", 1);
    }

    /* eslint-disable complexity */
    /**
     *
     * @param {string} key
     * @param {object[]} data
     */
    addBatch(key, data) {
        const offset = this.variableBuilder.vertexCount;

        const e = /** @type {Object.<string, import("../encoder/encoder").NumberEncoder>} */ (this
            .encoders);
        const [lower, upper] = this.visibleRange;

        /**
         * @param {import("../encoder/encoder").Encoder} encoder
         */
        const a = encoder =>
            encoder.constantValue || !isContinuous(encoder.scale.type)
                ? encoder
                : encoder.accessorWithModifier;
        const xAccessor = a(e.x);
        const x2Accessor = a(e.x2);
        const yAccessor = a(e.y);
        const y2Accessor = a(e.y2);

        for (const d of data) {
            let x = xAccessor(d),
                x2 = x2Accessor(d);

            if (x > x2) {
                [x, x2] = [x2, x];
            }

            // Skip rects that fall outside the visible range. TODO: Optimize by using binary search / interval tree
            if (x2 < lower || x > upper) {
                continue;
            }

            // Truncate to prevent tesselation of parts that are outside the viewport
            if (x < lower) x = lower;
            if (x2 > upper) x2 = upper;

            let y = yAccessor(d),
                y2 = y2Accessor(d);

            if (y > y2) {
                [y, y2] = [y2, y];
            }

            // Start a new segment.
            this.variableBuilder.updateFromDatum(d);

            const squeeze = /** @type {string} */ (this.encoders.squeeze(d));
            if (squeeze && squeeze != "none") {
                // This is probably terribly slow but for now, it's only used for
                // centromeres on the cytoband track.
                // TODO: Optimize and reduce object allocation
                const c = this._squeeze(squeeze, x, x2, y, y2);
                this.updateX(c[0][0][0]);
                this.updateX2(c[1][0][0]);
                this.updateY(c[0][0][1]);
                this.updateY2(c[1][0][1]);
                this.updateXFrac(c[0][0][2]);
                this.updateYFrac(c[0][0][3]);
                this.variableBuilder.pushAll();
                this.variableBuilder.pushAll();
                this.updateX(c[0][1][0]);
                this.updateX2(c[1][1][0]);
                this.updateY(c[0][1][1]);
                this.updateY2(c[1][1][1]);
                this.updateXFrac(c[0][1][2]);
                this.updateYFrac(c[0][1][3]);
                this.variableBuilder.pushAll();
                this.updateX(c[0][2][0]);
                this.updateX2(c[1][2][0]);
                this.updateY(c[0][2][1]);
                this.updateY2(c[1][2][1]);
                this.updateXFrac(c[0][2][2]);
                this.updateYFrac(c[0][2][3]);
                this.variableBuilder.pushAll();
                this.variableBuilder.pushAll();
            } else {
                this.updateX(x);
                this.updateX2(x2);
                this.updateXFrac(0);
                this.updateY(y);
                this.updateY2(y2);
                this.updateYFrac(0);

                // Duplicate the first vertex to produce degenerate triangles
                this.variableBuilder.pushAll();

                // Tesselate segments
                const tileCount = 1;
                const width = x2 - x;

                //    width < Infinity
                //        ? Math.ceil(width / this.tesselationThreshold)
                //        : 1;
                for (let i = 0; i <= tileCount; i++) {
                    const frac = i / tileCount;

                    this.updateXFrac(frac);
                    this.updateX(x + width * frac);
                    this.updateX2(x2 - width * frac);
                    this.updateY(y);
                    this.updateY2(y2);
                    this.updateYFrac(0);
                    this.variableBuilder.pushAll();
                    this.updateY(y2);
                    this.updateY2(y);
                    this.updateYFrac(1);
                    this.variableBuilder.pushAll();
                }

                // Duplicate the last vertex to produce a degenerate triangle between the segments
                this.variableBuilder.pushAll();
            }
        }

        const count = this.variableBuilder.vertexCount - offset;
        if (count) {
            this.rangeMap.set(key, {
                offset,
                count
                // TODO: Add some indices that allow rendering just a range
            });
        }
    }

    /**
     *
     * @param {string} squeeze
     * @param {number} x
     * @param {number} x2
     * @param {number} y
     * @param {number} y2
     */
    _squeeze(squeeze, x, x2, y, y2) {
        const xc = (x + x2) / 2;
        const yc = (y + y2) / 2;

        // points going round a rectangle clockwise, starting from the bottom left corner
        const points = [
            [x, y, 0, 0],
            [x, yc, 0, 0.5],
            [x, y2, 0, 1],
            [xc, y2, 0.5, 1],
            [x2, y2, 1, 1],
            [x2, yc, 1, 0.5],
            [x2, y, 1, 0],
            [xc, y, 0.5, 1]
        ];

        const top = [0, 3, 6];

        /** @param {number} steps */
        const rotate = steps =>
            top.map(x => points[(x + steps) % points.length]);

        /** @param {number} steps */
        const rotated = steps => [rotate(steps), rotate(steps + 4)];

        switch (squeeze) {
            case "top":
                return rotated(0);
            case "right":
                return rotated(2);
            case "bottom":
                return rotated(4);
            case "left":
                return rotated(6);
            default:
        }
    }
}

export class RuleVertexBuilder extends VertexBuilder {
    /**
     *
     * @param {Object} object
     * @param {Record<string, Encoder>} object.encoders
     * @param {Record<string, AttributeProps>} object.attributes
     * @param {number} [object.tesselationThreshold]
     *     If the rule is wider than the threshold, tesselate it into pieces
     * @param {number[]} [object.visibleRange]
     * @param {number} [object.numItems] Number of data items
     */
    constructor({
        encoders,
        attributes,
        tesselationThreshold = Infinity,
        visibleRange = [-Infinity, Infinity],
        numItems
    }) {
        super({
            encoders,
            converters: {},
            attributes,
            numVertices:
                tesselationThreshold == Infinity ? numItems * 6 : undefined
        });

        this.visibleRange = visibleRange;

        this.tesselationThreshold = tesselationThreshold || Infinity;

        this.updateSide = this.variableBuilder.createUpdater("side", 1);
        this.updatePos = this.variableBuilder.createUpdater("pos", 1);
    }

    /* eslint-disable complexity */
    /**
     *
     * @param {string} key
     * @param {object} data
     */
    addBatch(key, data) {
        const offset = this.variableBuilder.vertexCount;

        const e = /** @type {Object.<string, import("../encoder/encoder").NumberEncoder>} */ (this
            .encoders);
        const [lower, upper] = this.visibleRange; // TODO

        for (const d of data) {
            // Start a new rule. Duplicate the first vertex to produce degenerate triangles
            this.variableBuilder.updateFromDatum(d);
            this.updateSide(-0.5);
            this.updatePos(0);
            this.variableBuilder.pushAll();

            // Tesselate segments
            const tileCount = 1;
            //    width < Infinity
            //        ? Math.ceil(width / this.tesselationThreshold)
            //        : 1;
            for (let i = 0; i <= tileCount; i++) {
                this.updatePos(i / tileCount);
                this.updateSide(-0.5);
                this.variableBuilder.pushAll();
                this.updateSide(0.5);
                this.variableBuilder.pushAll();
            }

            // Duplicate the last vertex to produce a degenerate triangle between the rules
            this.variableBuilder.pushAll();
        }

        const count = this.variableBuilder.vertexCount - offset;
        if (count) {
            this.rangeMap.set(key, {
                offset,
                count
                // TODO: Add some indices that allow rendering just a range
            });
        }
    }
}

export class PointVertexBuilder extends VertexBuilder {
    /**
     *
     * @param {object} object
     * @param {Record<string, Encoder>} object.encoders
     * @param {Record<string, AttributeProps>} object.attributes
     * @param {number} [object.numItems] Number of points if known, uses TypedArray
     */
    constructor({ encoders, attributes, numItems = undefined }) {
        super({
            encoders,
            converters: {
                semanticScore: {
                    f: encoders.semanticScore,
                    numComponents: 1
                },
                shape: {
                    // TODO: Optimization: Reconfigure the scale to have the shape indices as the range
                    f: d => SHAPES[encoders.shape(d)] || 0,
                    numComponents: 1
                },
                strokeWidth: {
                    f: encoders.strokeWidth,
                    numComponents: 1
                },
                gradientStrength: {
                    f: encoders.gradientStrength,
                    numComponents: 1
                }
            },
            attributes,
            numVertices: numItems
        });
    }
}

export class ConnectionVertexBuilder extends VertexBuilder {
    /**
     * @param {object} object
     * @param {Record<string, Encoder>} object.encoders
     * @param {Record<string, AttributeProps>} object.attributes
     * @param {number} [object.numItems ] Number of points if known, uses TypedArray
     */
    constructor({ encoders, attributes, numItems = undefined }) {
        const c2f2 = createCachingColor2floatArray();
        super({
            encoders,
            converters: {
                size2: { f: encoders.size2, numComponents: 1 },
                height: { f: encoders.height, numComponents: 1 },
                color2: { f: d => c2f2(encoders.color2(d)), numComponents: 3 }
            },
            attributes,
            numVertices: numItems
        });
    }

    toArrays() {
        const arrays = this.variableBuilder.arrays;

        // Prepare for instanced rendering
        for (let a of Object.values(arrays)) {
            a.divisor = 1;
        }

        return super.toArrays();
    }
}

export class TextVertexBuilder extends VertexBuilder {
    /**
     *
     * @param {object} object
     * @param {Record<string, Encoder>} object.encoders
     * @param {Record<string, AttributeProps>} object.attributes
     * @param {import("../fonts/types").FontMetadata} object.metadata
     * @param {Record<string, any>} object.properties
     * @param {number} [object.numCharacters] number of characters
     */
    constructor({
        encoders,
        attributes,
        metadata,
        properties,
        numCharacters = undefined
    }) {
        super({
            encoders,
            attributes,
            numVertices: numCharacters * 6 // six vertices per quad (character)
        });

        this.metadata = metadata;
        this.metrics = getMetrics(metadata);

        this.properties = properties;

        const e = encoders;

        /** @type {function(any):any} */
        this.numberFormat = e.text.encodingConfig.format
            ? format(e.text.encodingConfig.format)
            : d => d;

        // TODO: Store these as vec2
        this.updateCX = this.variableBuilder.createUpdater("cx", 1);
        this.updateCY = this.variableBuilder.createUpdater("cy", 1);

        // Texture
        this.updateTX = this.variableBuilder.createUpdater("tx", 1);
        this.updateTY = this.variableBuilder.createUpdater("ty", 1);

        this.updateWidth = this.variableBuilder.createUpdater("width", 1);
    }

    /**
     *
     * @param {String} key
     * @param {object[]} data
     */
    addBatch(key, data) {
        const offset = this.variableBuilder.vertexCount;

        const align = this.properties.align || "left";

        const base = this.metadata.common.base;
        const scale = this.metadata.common.scaleH; // Assume square textures

        let baseline = -SDF_PADDING;
        switch (this.properties.baseline) {
            case "top":
                baseline += this.metrics.capHeight;
                break;
            case "middle":
                baseline += this.metrics.capHeight / 2;
                break;
            case "bottom":
                baseline -= this.metrics.descent;
                break;
            default:
            // alphabetic
        }

        const accessor = this.encoders.text.accessor || this.encoders.text; // accessor or constant value

        for (const d of data) {
            const value = this.numberFormat(accessor(d));
            const str = isString(value)
                ? value
                : value === null
                ? ""
                : "" + value;
            if (str.length == 0) continue;

            this.variableBuilder.updateFromDatum(d);

            const textWidth = this.metrics.measureWidth(str);

            this.updateWidth(textWidth); // TODO: Check if one letter space should be reduced

            let x =
                align == "right"
                    ? -textWidth
                    : align == "center"
                    ? -textWidth / 2
                    : 0;

            const firstChar = this.metrics.getCharByCode(str.charCodeAt(0));
            x -= (firstChar.width - firstChar.xadvance) / base / 2; // TODO: Fix, this is a bit off..

            for (let i = 0; i < str.length; i++) {
                const c = this.metrics.getCharByCode(str.charCodeAt(i));

                const tx = c.x;
                const ty = c.y;
                const advance = c.xadvance / base;

                if (c.id == 32) {
                    x += advance;
                    continue;
                }

                // TODO: Simplify
                const height = c.height / base;
                const bottom = -(c.height + c.yoffset + baseline) / base;

                this.updateCX(x);
                this.updateCY(bottom + height);
                this.updateTX(tx / scale);
                this.updateTY(ty / scale);
                this.variableBuilder.pushAll();

                this.updateCX(x + c.width / base);
                this.updateCY(bottom + height);
                this.updateTX((tx + c.width) / scale);
                this.updateTY(ty / scale);
                this.variableBuilder.pushAll();

                this.updateCX(x);
                this.updateCY(bottom);
                this.updateTX(tx / scale);
                this.updateTY((ty + c.height) / scale);
                this.variableBuilder.pushAll();

                this.updateCX(x + c.width / base);
                this.updateCY(bottom + height);
                this.updateTX((tx + c.width) / scale);
                this.updateTY(ty / scale);
                this.variableBuilder.pushAll();

                this.updateCX(x);
                this.updateCY(bottom);
                this.updateTX(tx / scale);
                this.updateTY((ty + c.height) / scale);
                this.variableBuilder.pushAll();

                this.updateCX(x + c.width / base);
                this.updateCY(bottom);
                this.updateTX((tx + c.width) / scale);
                this.updateTY((ty + c.height) / scale);
                this.variableBuilder.pushAll();

                x += advance;
            }
        }

        const count = this.variableBuilder.vertexCount - offset;
        if (count) {
            this.rangeMap.set(key, {
                offset,
                count
                // TODO: Add some indices that allow rendering just a range
            });
        }
    }
}
