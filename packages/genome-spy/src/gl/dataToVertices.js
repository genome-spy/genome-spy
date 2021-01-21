import { format } from "d3-format";
import { isString } from "vega-util";
import { fp64ify } from "./includes/fp64-utils";
import ArrayBuilder from "./arrayBuilder";
import getMetrics, { SDF_PADDING } from "../utils/bmFontMetrics";
import { peek } from "../utils/arrayUtils";
import createBinningRangeIndexer from "../utils/binnedRangeIndex";

/**
 * @typedef {object} RangeEntry Represents a location of a vertex subset
 * @prop {number} offset in vertices
 * @prop {number} count in vertices
 * @prop {import("../utils/binnedRangeIndex").Lookup} xIndex
 *
 * @typedef {import("./arraybuilder").ConverterMetadata} Converter
 * @typedef {import("../encoder/encoder").Encoder} Encoder
 */
export class GeometryBuilder {
    /**
     *
     * @param {object} object
     * @param {Record<string, Encoder>} object.encoders
     * @param {string[]} [object.attributes]
     * @param {number} [object.numVertices] If the number of data items is known, a
     *      preallocated TypedArray is used
     * @param {boolean} [object.buildXIndex] True if data are sorted by the field mapped to x channel and should be indexed
     */
    constructor({
        encoders,
        numVertices = undefined,
        attributes = [],
        buildXIndex = false
    }) {
        this.encoders = encoders;
        this._buildXIndex = buildXIndex;

        // Encoders for variable channels
        this.variableEncoders = Object.fromEntries(
            Object.entries(encoders).filter(
                ([channel, e]) =>
                    attributes.includes(channel) && e && e.scale && !e.constant
            )
        );

        this.allocatedVertices = numVertices;

        this.variableBuilder = new ArrayBuilder(numVertices);

        // Create converters and updaters for all variable channels.
        // TODO: If more than one channels use the same field with the same data type, convert the field only once.

        for (const [channel, ce] of Object.entries(this.variableEncoders)) {
            const accessor = ce.accessor;

            const doubleArray = [0, 0];
            const fp64 = ce.scale.fp64;

            /**
             * Discrete variables both numeric and strings must be "indexed",
             * 64 bit floats must be converted to vec2.
             * 32 bit continuous variables go to GPU as is.
             *
             * @type {function(any):(number | number[])}
             */
            const f = ce.indexer
                ? ce.indexer
                : fp64
                ? d => fp64ify(accessor(d), doubleArray)
                : accessor;

            this.variableBuilder.addConverter(channel, {
                f,
                numComponents: fp64 ? 2 : 1,
                arrayReference: fp64 ? doubleArray : undefined
            });
        }

        this.lastOffset = 0;

        /** @type {Map<any, RangeEntry>} keep track of sample locations within the vertex array */
        this.rangeMap = new Map();
    }

    /**
     * Must be called at the end of `addBatch`
     *
     * @param {any} key
     */
    registerBatch(key) {
        const offset = this.lastOffset;
        const index = this.variableBuilder.vertexCount;
        const size = index - offset;
        if (size) {
            this.rangeMap.set(key, {
                offset,
                count: size,
                xIndex: this.xIndexer?.getIndex()
            });
        }
        this.lastOffset = index;
    }

    /**
     * @param {String} key The facet id, for example
     * @param {object[]} data
     */
    addBatch(key, data) {
        for (const p of data) {
            this.variableBuilder.pushFromDatum(p);
        }

        this.registerBatch(key);
    }

    /**
     * @param {any[]} data
     */
    prepareXIndexer(data) {
        if (!this._buildXIndex) {
            return;
        }

        const xe = this.variableEncoders.x;
        const x2e = this.variableEncoders.x2;

        if (xe && x2e) {
            const xa = xe.accessor;
            const x2a = x2e.accessor;

            this.xIndexer = createBinningRangeIndexer(50, [
                xa(data[0]),
                x2a(peek(data))
            ]);

            let lastVertexCount = this.variableBuilder.vertexCount;

            /**
             * @param {any} datum
             */
            this.addToXIndex = datum => {
                let currentVertexCount = this.variableBuilder.vertexCount;
                this.xIndexer(
                    xa(datum),
                    x2a(datum),
                    lastVertexCount,
                    currentVertexCount
                );
                lastVertexCount = currentVertexCount;
            };
        } else {
            this.xIndexer = undefined;
            /**
             * @param {any} datum
             */
            this.addToXIndex = datum => {
                //
            };
        }
    }

    /**
     * Add the datum to an index, which allows for efficient rendering of ranges
     * on the x axis. Must be called after a datum has been pushed to the ArrayBuilder.
     *
     * @param {any} datum
     */
    addToXIndex(datum) {
        //
    }

    toArrays() {
        return {
            /** @type {Record<string, {data: number[] | Float32Array, numComponents: number, divisor?: number}>} */
            arrays: this.variableBuilder.arrays,
            /** Number of vertices used */
            vertexCount: this.variableBuilder.vertexCount,
            /** Number of vertices allocated in buffers */
            allocatedVertices: this.allocatedVertices,
            rangeMap: this.rangeMap
            // TODO: better name for "componentNumbers"
            /* TODO: Fix: needed by connection mark
            componentNumbers: Object.fromEntries(
                Object.entries(this.converters).map(e => [
                    e[0],
                    (e[1] && e[1].numComponents) || undefined // TODO: Check
                ])
            )
            */
        };
    }
}

export class RectVertexBuilder extends GeometryBuilder {
    /**
     *
     * @param {Object} object
     * @param {Record<string, Encoder>} object.encoders
     * @param {string[]} object.attributes
     * @param {number} [object.tesselationThreshold]
     *     If the rect is wider than the threshold, tesselate it into pieces
     * @param {number[]} [object.visibleRange]
     * @param {number} [object.numItems] Number of data items
     * @param {boolean} [object.buildXIndex] True if data are sorted by the field mapped to x channel and should be indexed
     */
    constructor({
        encoders,
        attributes,
        tesselationThreshold = Infinity,
        visibleRange = [-Infinity, Infinity],
        numItems,
        buildXIndex = false
    }) {
        super({
            encoders,
            attributes,
            numVertices:
                tesselationThreshold == Infinity ? numItems * 6 : undefined,
            buildXIndex
        });

        this.visibleRange = visibleRange;

        this.tesselationThreshold = tesselationThreshold || Infinity;

        this.updateFrac = this.variableBuilder.createUpdater("frac", 2);
    }

    /**
     *
     * @param {any} key
     * @param {object[]} data
     */
    addBatch(key, data) {
        if (!data.length) {
            return;
        }

        const e = /** @type {Object.<string, import("../encoder/encoder").NumberEncoder>} */ (this
            .encoders);
        const [lower, upper] = this.visibleRange;

        /**
         * @param {import("../encoder/encoder").Encoder} encoder
         */
        const a = encoder => encoder.accessor || (x => 0);

        const xAccessor = a(e.x);
        const x2Accessor = a(e.x2);

        this.prepareXIndexer(data);

        const frac = [0, 0];
        this.updateFrac(frac);

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

            // Truncate to prevent tessellation of parts that are outside the viewport
            if (x < lower) x = lower;
            if (x2 > upper) x2 = upper;

            // Start a new segment.
            this.variableBuilder.updateFromDatum(d);

            frac[0] = 0;
            frac[1] = 0;

            // Tessellate segments
            const tileCount = 1;
            //    width < Infinity
            //        ? Math.ceil(width / this.tesselationThreshold)
            //        : 1;

            // Duplicate the first vertex to produce degenerate triangles
            this.variableBuilder.pushAll();

            for (let i = 0; i <= tileCount; i++) {
                frac[0] = i / tileCount;
                frac[1] = 0;
                this.variableBuilder.pushAll();
                frac[1] = 1;
                this.variableBuilder.pushAll();
            }

            // Duplicate the last vertex to produce a degenerate triangle between the segments
            this.variableBuilder.pushAll();
            this.addToXIndex(d);
        }

        this.registerBatch(key);
    }
}

export class RuleVertexBuilder extends GeometryBuilder {
    /**
     *
     * @param {Object} object
     * @param {Record<string, Encoder>} object.encoders
     * @param {string[]} object.attributes
     * @param {number} [object.tesselationThreshold]
     *     If the rule is wider than the threshold, tesselate it into pieces
     * @param {number[]} [object.visibleRange]
     * @param {number} [object.numItems] Number of data items
     * @param {boolean} [object.buildXIndex] True if data are sorted by the field mapped to x channel and should be indexed
     */
    constructor({
        encoders,
        attributes,
        tesselationThreshold = Infinity,
        visibleRange = [-Infinity, Infinity],
        numItems,
        buildXIndex
    }) {
        super({
            encoders,
            attributes,
            numVertices:
                tesselationThreshold == Infinity ? numItems * 6 : undefined,
            buildXIndex
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
     * @param {object[]} data
     */
    addBatch(key, data) {
        const e = /** @type {Object.<string, import("../encoder/encoder").NumberEncoder>} */ (this
            .encoders);
        const [lower, upper] = this.visibleRange; // TODO

        this.prepareXIndexer(data);

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
            this.addToXIndex(d);
        }

        this.registerBatch(key);
    }
}

export class PointVertexBuilder extends GeometryBuilder {
    /**
     *
     * @param {object} object
     * @param {Record<string, Encoder>} object.encoders
     * @param {string[]} object.attributes
     * @param {number} [object.numItems] Number of points if known, uses TypedArray
     */
    constructor({ encoders, attributes, numItems = undefined }) {
        super({
            encoders,
            attributes,
            numVertices: numItems
        });
    }
}

export class ConnectionVertexBuilder extends GeometryBuilder {
    /**
     * BROKEN !!!!!!!
     * FIX !!!!!!!
     *
     * @param {object} object
     * @param {Record<string, Encoder>} object.encoders
     * @param {string[]} object.attributes
     * @param {number} [object.numItems ] Number of points if known, uses TypedArray
     */
    constructor({ encoders, attributes, numItems = undefined }) {
        super({
            encoders,
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

export class TextVertexBuilder extends GeometryBuilder {
    /**
     *
     * @param {object} object
     * @param {Record<string, Encoder>} object.encoders
     * @param {string[]} object.attributes
     * @param {import("../fonts/types").FontMetadata} object.metadata
     * @param {Record<string, any>} object.properties
     * @param {number} [object.numCharacters] number of characters
     * @param {boolean} [object.buildXIndex] True if data are sorted by the field mapped to x channel and should be indexed
     */
    constructor({
        encoders,
        attributes,
        metadata,
        properties,
        numCharacters = undefined,
        buildXIndex = false
    }) {
        super({
            encoders,
            attributes,
            numVertices: numCharacters * 6, // six vertices per quad (character)
            buildXIndex
        });

        this.metadata = metadata;
        this.metrics = getMetrics(metadata);

        this.properties = properties;

        const e = encoders;

        /** @type {function(any):any} */
        this.numberFormat = e.text.channelDef.format
            ? format(e.text.channelDef.format)
            : d => d;

        this.updateVertexCoord = this.variableBuilder.createUpdater(
            "vertexCoord",
            2
        );
        this.updateTextureCoord = this.variableBuilder.createUpdater(
            "textureCoord",
            2
        );

        this.updateWidth = this.variableBuilder.createUpdater("width", 1);
    }

    /**
     *
     * @param {String} key
     * @param {object[]} data
     */
    addBatch(key, data) {
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

        const vertexCoord = [0, 0];
        this.updateVertexCoord(vertexCoord);
        const textureCoord = [0, 0];
        this.updateTextureCoord(textureCoord);

        this.prepareXIndexer(data);

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

                vertexCoord[0] = x;
                vertexCoord[1] = bottom + height;
                textureCoord[0] = tx / scale;
                textureCoord[1] = ty / scale;
                this.variableBuilder.pushAll();

                vertexCoord[0] = x + c.width / base;
                vertexCoord[1] = bottom + height;
                textureCoord[0] = (tx + c.width) / scale;
                textureCoord[1] = ty / scale;
                this.variableBuilder.pushAll();

                vertexCoord[0] = x;
                vertexCoord[1] = bottom;
                textureCoord[0] = tx / scale;
                textureCoord[1] = (ty + c.height) / scale;
                this.variableBuilder.pushAll();

                vertexCoord[0] = x + c.width / base;
                vertexCoord[1] = bottom + height;
                textureCoord[0] = (tx + c.width) / scale;
                textureCoord[1] = ty / scale;
                this.variableBuilder.pushAll();

                vertexCoord[0] = x;
                vertexCoord[1] = bottom;
                textureCoord[0] = tx / scale;
                textureCoord[1] = (ty + c.height) / scale;
                this.variableBuilder.pushAll();

                vertexCoord[0] = x + c.width / base;
                vertexCoord[1] = bottom;
                textureCoord[0] = (tx + c.width) / scale;
                textureCoord[1] = (ty + c.height) / scale;
                this.variableBuilder.pushAll();

                x += advance;
            }

            this.addToXIndex(data);
        }

        this.registerBatch(key);
    }
}
