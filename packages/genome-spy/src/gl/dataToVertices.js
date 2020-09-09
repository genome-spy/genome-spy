import { color as d3color } from "d3-color";
import { format } from "d3-format";
import { fastmap, isString } from "vega-util";
import { fp64ify } from "./includes/fp64-utils";
import Interval from "../utils/interval";
import { SHAPES } from "../marks/pointMark"; // Circular dependency, TODO: Fix
import ArrayBuilder from "./arrayBuilder";

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
        return [1, 0, 1]; // Just an indicator of error
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

export class RectVertexBuilder {
    /**
     *
     * @param {Object.<string, import("../encoder/encoder").Encoder>} encoders
     * @param {Object} object
     * @param {number} [object.tesselationThreshold]
     *     If the rect is narrower than the threshold, tesselate it into pieces
     * @param {number[]} [object.visibleRange]
     */
    constructor(
        encoders,
        {
            tesselationThreshold = Infinity,
            visibleRange = [-Infinity, Infinity]
        }
    ) {
        this.encoders = encoders;
        this.visibleRange = visibleRange;

        const e = encoders;

        this.tesselationThreshold = tesselationThreshold || Infinity;

        /** @type {Object.<string, import("./arraybuilder").Converter>} */
        const converters = {
            color: { f: d => color2floatArray(e.color(d)), numComponents: 3 },
            opacity: { f: e.opacity, numComponents: 1 }
        };

        const constants = Object.entries(encoders)
            .filter(e => e[1].constant)
            .map(e => e[0]);
        const variables = Object.entries(encoders)
            .filter(e => !e[1].constant)
            .map(e => e[0]);

        this.variableBuilder = ArrayBuilder.create(converters, variables);

        this.updateX = this.variableBuilder.createUpdater("x", 2);
        this.updateY = this.variableBuilder.createUpdater("y", 1);
        // TODO: Optimization: width/height could be constants when minWidth/minHeight are zero
        this.updateWidth = this.variableBuilder.createUpdater("width", 1);
        this.updateHeight = this.variableBuilder.createUpdater("height", 1);

        this.constantBuilder = ArrayBuilder.create(converters, constants);
        this.constantBuilder.updateFromDatum({});
        this.constantBuilder.pushAll();

        this.rangeMap = new Map();
    }

    /* eslint-disable complexity */
    /**
     *
     * @param {string} key
     * @param {object} data
     */
    addBatch(key, data) {
        const offset = this.variableBuilder.vertexCount;

        const fpa = [0, 0]; // optimize fp64ify

        const e = /** @type {Object.<string, import("../encoder/encoder").NumberEncoder>} */ (this
            .encoders);
        const [lower, upper] = this.visibleRange;

        for (const d of data) {
            let x = e.x(d),
                x2 = e.x2(d);

            if (x > x2) {
                [x, x2] = [x2, x];
            }

            // Skip rects that fall outside the visible range. TODO: Optimize by using binary search / interval tree
            if (x2 < lower || x > upper) {
                continue;
            }

            if (x < lower) x = lower;
            if (x2 > upper) x2 = upper;

            let y = e.y(d),
                y2 = e.y2(d);

            if (y > y2) {
                [y, y2] = [y2, y];
            }

            const width = x2 - x || Math.pow(0.1, 20); // A hack to allow minWidth for zero-height rects.
            const height = y2 - y || Math.pow(0.1, 20); // TODO: Fix the hack

            // Start a new segment. Duplicate the first vertex to produce degenerate triangles
            this.variableBuilder.updateFromDatum(d);

            const squeeze = /** @type {string} */ (e.squeeze(d));
            if (squeeze && squeeze != "none") {
                const c = this._squeeze(squeeze, x, x2, y, y2);
                this.updateX(fp64ify(c.ax, fpa));
                this.updateY(c.ay);
                this.variableBuilder.pushAll();
                this.variableBuilder.pushAll();
                this.updateX(fp64ify(c.bx, fpa));
                this.updateY(c.by);
                this.variableBuilder.pushAll();
                this.updateX(fp64ify(c.cx, fpa));
                this.updateY(c.cy);
                this.variableBuilder.pushAll();
                this.variableBuilder.pushAll();
            } else {
                this.updateX(fp64ify(x, fpa));
                this.updateWidth(-width);
                this.updateY(y);
                this.updateHeight(height);
                this.variableBuilder.pushAll();

                // Tesselate segments
                const tileCount =
                    width < Infinity
                        ? Math.ceil(width / this.tesselationThreshold)
                        : 1;
                for (let i = 0; i <= tileCount; i++) {
                    const frac = i / tileCount;

                    let w = 0;
                    if (i == 0) {
                        w = -width;
                    } else if (i >= tileCount) {
                        w = width;
                    }

                    this.updateWidth(w);

                    // Note: Infinity is used for horizontal and vertical rule marks that have unspecified start/end coords
                    const tx = isFinite(width)
                        ? x + width * frac
                        : i == 0
                        ? -Infinity
                        : Infinity;

                    this.updateX(fp64ify(tx, fpa));
                    this.updateY(y);
                    this.updateHeight(height);
                    this.variableBuilder.pushAll();
                    this.updateY(y2);
                    this.updateHeight(-height);
                    this.variableBuilder.pushAll();
                }

                // Duplicate the last vertex to produce a degenerate triangle between the segments
                this.variableBuilder.updateFromDatum(d);
                this.updateX(fp64ify(x2, fpa));
                this.updateWidth(width);
                this.updateHeight(-height);
                this.updateY(y2);
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
        switch (squeeze) {
            case "bottom":
                return {
                    ax: x,
                    ay: y2,
                    bx: (x + x2) / 2,
                    by: y,
                    cx: x2,
                    cy: y2
                };
            case "top":
                return {
                    ax: x,
                    ay: y,
                    bx: x2,
                    by: y,
                    cx: (x + x2) / 2,
                    cy: y2
                };
            case "left":
                return {
                    ax: x,
                    ay: (y + y2) / 2,
                    bx: x2,
                    by: y,
                    cx: x2,
                    cy: y2
                };
            case "right":
                return {
                    ax: x,
                    ay: y,
                    bx: x2,
                    by: (y + y2) / 2,
                    cx: x,
                    cy: y2
                };
            default:
        }
    }

    toArrays() {
        return {
            arrays: {
                ...this.variableBuilder.arrays,
                ...this.constantBuilder.toValues()
            },
            vertexCount: this.variableBuilder.vertexCount,
            drawMode: glConst.TRIANGLE_STRIP,
            rangeMap: this.rangeMap
        };
    }
}

export class PointVertexBuilder {
    /**
     *
     * @param {Object.<string, import("../encoder/encoder").Encoder>} encoders
     * @param {number} [size] Number of points if known, uses TypedArray
     */
    constructor(encoders, size) {
        const e = /** @type {Object.<string, import("../encoder/encoder").NumberEncoder>} */ (encoders);

        const c2f = createCachingColor2floatArray();

        const fpa = [0, 0]; // optimize fp64ify

        /** @type {Object.<string, import("./arraybuilder").Converter>} */
        const converters = {
            x: { f: d => fp64ify(e.x(d), fpa), numComponents: 2 },
            y: { f: e.y, numComponents: 1 },
            size: { f: e.size, numComponents: 1 },
            color: { f: d => c2f(e.color(d)), numComponents: 3 },
            opacity: { f: e.opacity, numComponents: 1 },
            semanticScore: { f: e.semanticScore, numComponents: 1 },
            shape: { f: d => SHAPES[e.shape(d)] || 0, numComponents: 1 },
            strokeWidth: { f: e.strokeWidth, numComponents: 1 },
            gradientStrength: { f: e.gradientStrength, numComponents: 1 }
        };

        const constants = Object.entries(encoders)
            .filter(e => e[1].constant)
            .map(e => e[0]);
        const variables = Object.entries(encoders)
            .filter(e => !e[1].constant)
            .map(e => e[0]);

        this.variableBuilder = ArrayBuilder.create(converters, variables, size);
        this.constantBuilder = ArrayBuilder.create(converters, constants);

        this.constantBuilder.updateFromDatum({});
        this.constantBuilder.pushAll();

        this.index = 0;
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
            arrays: {
                ...this.variableBuilder.arrays,
                ...this.constantBuilder.toValues()
            },
            vertexCount: this.index,
            drawMode: glConst.POINTS,
            rangeMap: this.rangeMap
        };
    }
}

export class ConnectionVertexBuilder {
    /**
     * TODO: Create a base class or something. This is now almost identical to PointVertexBuilder
     *
     * @param {Object.<string, import("../encoder/encoder").Encoder>} encoders
     * @param {number} [size] Number of points if known, uses TypedArray
     */
    constructor(encoders, size) {
        const e = /** @type {Object.<string, import("../encoder/encoder").NumberEncoder>} */ (encoders);

        const c2f = createCachingColor2floatArray();
        const c2f2 = createCachingColor2floatArray();

        const fpa = [0, 0]; // optimize fp64ify
        const fpa2 = [0, 0]; // optimize fp64ify

        /** @type {Object.<string, import("./arraybuilder").Converter>} */
        this._converters = {
            x: { f: d => fp64ify(e.x(d), fpa), numComponents: 2 },
            x2: { f: d => fp64ify(e.x2(d), fpa2), numComponents: 2 },
            y: { f: e.y, numComponents: 1 },
            y2: { f: e.y2, numComponents: 1 },
            size: { f: e.size, numComponents: 1 },
            size2: { f: e.size2, numComponents: 1 },
            height: { f: e.height, numComponents: 1 },
            color: { f: d => c2f(e.color(d)), numComponents: 3 },
            color2: { f: d => c2f2(e.color2(d)), numComponents: 3 },
            opacity: { f: e.opacity, numComponents: 1 }
        };

        const constants = Object.entries(encoders)
            .filter(e => e[1].constant)
            .map(e => e[0]);
        const variables = Object.entries(encoders)
            .filter(e => !e[1].constant)
            .map(e => e[0]);

        this.variableBuilder = ArrayBuilder.create(
            this._converters,
            variables,
            size
        );
        this.constantBuilder = ArrayBuilder.create(this._converters, constants);

        this.constantBuilder.updateFromDatum({});
        this.constantBuilder.pushAll();

        this.index = 0;
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
        const arrays = this.variableBuilder.arrays;

        // Prepare for instanced rendering
        for (let a of Object.values(arrays)) {
            a.divisor = 1;
        }

        return {
            arrays: {
                ...arrays,
                ...this.constantBuilder.toValues()
            },
            vertexCount: this.index,
            drawMode: glConst.POINTS,
            rangeMap: this.rangeMap,
            componentNumbers: Object.fromEntries(
                Object.entries(this._converters).map(e => [
                    e[0],
                    e[1].numComponents
                ])
            )
        };
    }
}

export class TextVertexBuilder {
    /**
     *
     * @param {Object.<string, import("../encoder/encoder").Encoder>} encoders
     * @param {import("../fonts/types").FontMetadata} metadata
     * @param {object} properties
     * @param {number} [size]
     */
    constructor(encoders, metadata, properties, size) {
        this.encoders = encoders;
        this.metadata = metadata;
        this.properties = properties;

        const e = encoders;

        /** @type {Object.<string, import("./arraybuilder").Converter>} */
        const converters = {
            x: { f: d => fp64ify(e.x(d)), numComponents: 2 },
            y: { f: e.y, numComponents: 1 },
            color: { f: d => color2floatArray(e.color(d)), numComponents: 3 },
            opacity: { f: e.opacity, numComponents: 1 },
            size: { f: e.size, numComponents: 1 }
        };

        if (encoders.x2) {
            converters.x2 = { f: d => fp64ify(e.x2(d)), numComponents: 2 };
        }

        /** @type {function(any):any} */
        this.numberFormat = e.text.encodingConfig.format
            ? format(e.text.encodingConfig.format)
            : d => d;

        const constants = Object.entries(encoders)
            .filter(e => e[1].constant)
            .map(e => e[0]);
        const variables = Object.entries(encoders)
            .filter(e => !e[1].constant)
            .map(e => e[0]);

        this.variableBuilder = ArrayBuilder.create(
            converters,
            variables,
            size * 6
        );

        // TODO: Store these as vec2
        this.updateCX = this.variableBuilder.createUpdater("cx", 1);
        this.updateCY = this.variableBuilder.createUpdater("cy", 1);

        // Texture
        this.updateTX = this.variableBuilder.createUpdater("tx", 1);
        this.updateTY = this.variableBuilder.createUpdater("ty", 1);

        this.updateWidth = this.variableBuilder.createUpdater("width", 1);

        this.constantBuilder = ArrayBuilder.create(converters, constants);
        this.constantBuilder.updateFromDatum({});
        this.constantBuilder.pushAll();

        this.rangeMap = new Map();
    }

    /**
     *
     * @param {String} key
     * @param {object[]} data
     */
    addBatch(key, data) {
        const offset = this.variableBuilder.vertexCount;

        const chars = Object.fromEntries(
            this.metadata.chars.map(e => [e.id, e])
        );

        const align = this.properties.align || "left";

        const base = this.metadata.common.base;
        const scale = this.metadata.common.scaleH; // Assume square textures

        const getChar = /** @param {number} charCode */ charCode =>
            chars[charCode] || chars[63];

        // Font metrics are not available in the bmfont metadata. Have to calculate...
        const sdfPadding = 5;
        const xHeight = getChar("x".charCodeAt(0)).height - sdfPadding * 2;
        const capHeight = getChar("X".charCodeAt(0)).height - sdfPadding * 2;

        let baseline = -sdfPadding;
        switch (this.properties.baseline) {
            case "top":
                baseline += capHeight;
                break;
            case "middle":
                baseline += capHeight / 2;
                break;
            case "bottom":
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

            let textWidth = 0;
            for (let i = 0; i < str.length; i++) {
                textWidth += getChar(str.charCodeAt(i)).xadvance;
            }
            textWidth /= base;

            this.updateWidth(textWidth); // TODO: Check if one letter space should be reduced

            let x =
                align == "right"
                    ? -textWidth
                    : align == "center"
                    ? -textWidth / 2
                    : 0;

            const firstChar = getChar(str.charCodeAt(0));
            x -= (firstChar.width - firstChar.xadvance) / base / 2; // TODO: Fix, this is a bit off..

            for (let i = 0; i < str.length; i++) {
                const c = getChar(str.charCodeAt(i));

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

    toArrays() {
        return {
            arrays: {
                ...this.variableBuilder.arrays,
                ...this.constantBuilder.toValues()
            },
            vertexCount: this.variableBuilder.vertexCount,
            drawMode: glConst.TRIANGLES,
            rangeMap: this.rangeMap
        };
    }
}

/**
 * @typedef {Object} SegmentSpec Describes how a segment should be visualized
 * @prop {Interval} interval
 * @prop {number} [paddingTop]
 * @prop {number} [paddingTopLeft]
 * @prop {number} [paddingTopRight]
 * @prop {number} [paddingBottom]
 * @prop {number} [paddingBottomLeft]
 * @prop {number} [paddingBottomRight]
 * @prop {Object} [color]
 * @prop {Object} [colorTop]
 * @prop {Object} [colorBottom]
 */

/**
 * Legacy stuff here.
 * Converts the given segments into typed arrays of vertices
 *
 * @param {SegmentSpec[]} segments
 * @param {number} [tesselationThreshold] Tesselate segments if they are shorter than the threshold
 */
export function segmentsToVertices(segments, tesselationThreshold = 8000000) {
    const black = d3color("black");

    const x = [];
    const y = [];
    const colors = [];
    const opacities = [];

    const fpab = [0, 0]; // optimize fp64ify
    const fpae = [0, 0]; // optimize fp64ify

    // TODO: This is a bit slow and should be profiled more carefully

    for (let s of segments) {
        // Emulate 64bit floats using two 32bit floats
        const begin = fp64ify(s.interval.lower, fpab);
        const end = fp64ify(s.interval.upper, fpae);

        const topLeft = 0.0 + (s.paddingTopLeft || s.paddingTop || 0);
        const topRight = 0.0 + (s.paddingTopRight || s.paddingTop || 0);

        const bottomLeft = 1.0 - (s.paddingBottomLeft || s.paddingBottom || 0);
        const bottomRight =
            1.0 - (s.paddingBottomRight || s.paddingBottom || 0);

        const color = s.color || black;
        const colorTop = s.colorTop || color;
        const colorBottom = s.colorBottom || color;

        // TODO: Conserve memory, use int8 color components instead of floats
        const tc = color2floatArray(colorTop);
        const bc = color2floatArray(colorBottom);

        // Start a new segment. Duplicate the first vertex to produce degenerate triangles
        x.push(...begin);
        y.push(bottomLeft);
        colors.push(...bc);
        opacities.push(1);

        // Tesselate segments
        const tileCount =
            s.interval.width() < Infinity &&
            Math.ceil(s.interval.width() / tesselationThreshold);
        for (let i = 0; i <= tileCount; i++) {
            const r = i / tileCount;
            // Interpolate X & Y
            // TODO: Computation could be optimized a bit. Width is computed repetedly, etc..
            const iX = fp64ify(s.interval.lower + s.interval.width() * r, fpab);
            const iBottom = bottomLeft + (bottomRight - bottomLeft) * r;
            const iTop = topLeft + (topRight - topLeft) * r;
            x.push(...iX, ...iX);
            y.push(iBottom, iTop);
            colors.push(...bc, ...tc);
            opacities.push(1, 1);
        }

        // Duplicate the last vertex to produce a degenerate triangle between the segments
        x.push(...end);
        y.push(topRight);
        colors.push(...tc);
        opacities.push(1);
    }

    return {
        arrays: {
            x: { data: new Float32Array(x), numComponents: 2 },
            y: { data: new Float32Array(y), numComponents: 1 },
            width: { data: new Float32Array(y.length), numComponents: 1 },
            color: { data: new Float32Array(colors), numComponents: 3 },
            opacity: { data: new Float32Array(opacities), numComponents: 1 }
        },
        vertexCount: y.length,
        drawMode: glConst.TRIANGLE_STRIP
    };
}
