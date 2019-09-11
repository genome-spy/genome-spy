import { color as d3color } from 'd3-color';
import { fastmap, isString } from 'vega-util';
import { fp64ify } from './includes/fp64-utils';
import Interval from "../utils/interval";
import { shapes } from "../marks/pointMark"; // Circular dependency, TODO: Fix

/*
 * TODO: Optimize constant values: compile them dynamically into vertex shader
 */

const black = d3color("black");
const gray = d3color("gray");

// https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Constants
const glConst = {
    POINTS: 0x0000,
    TRIANGLES: 0x0004,
    TRIANGLE_STRIP: 0x0005,
    STATIC_DRAW: 0x88E4
};

function color2floatArray(color) {
    if (!color) {
        return [1, 0, 1]; // Just an indicator of error
        
    } else if (isString(color)) {
        color = d3color(color);
    }
    return [color.r / 255.0, color.g / 255.0, color.b / 255.0];
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
    }
}

/**
 * @typedef {Object} RectSpec
 * @prop {number} x
 * @prop {number} x2
 * @prop {number} y
 * @prop {number} y2
 * @prop {Object | string} [color]
 * @prop {number} [opacity]
 */

/**
 * @typedef {Object} PointSpec
 * @prop {number} x
 * @prop {number} [size] Width or height of the symbol
 * @prop {Object} [color]
 * @prop {number} [zoomThreshold]
 * @prop {Object} [rawDatum] Shown as tooltip
 * TODO: y, symbol, orientation, aspectRatio
 */

export class RectVertexBuilder {
    /**
     * 
     * @param {Object.<string, import("../encoder/encoder").Encoder>} encoders
     * @param {Object} object
     * @param {number} [object.tesselationThreshold]
     *     If the rect is narrower than the threshold, tesselate it into pieces
     * @param {number[]} [object.visibleRange]
     */
    constructor(encoders, { tesselationThreshold = Infinity, visibleRange = [-Infinity, Infinity]}) {

        this.encoders = encoders;
        this.visibleRange = visibleRange;

        const e = encoders;

        this.tesselationThreshold = tesselationThreshold || Infinity;

        const converters = {
            color:   { f: d => color2floatArray(e.color(d)), numComponents: 3 },
            opacity: { f: d => e.opacity(d), numComponents: 1 },
        };

        const constants = Object.entries(encoders).filter(e => e[1].constant).map(e => e[0]);
        const variables = Object.entries(encoders).filter(e => !e[1].constant).map(e => e[0]);

        this.variableBuilder = ArrayBuilder.create(converters, variables);

        this.updateX = this.variableBuilder.createUpdater("x", 2);
        this.updateY = this.variableBuilder.createUpdater("y", 1);
        // TODO: Optimization: width/height could be constants when minWidth/minHeight are zero
        this.updateWidth = this.variableBuilder.createUpdater("width", 1);
        this.updateHeight = this.variableBuilder.createUpdater("height", 1);

        this.constantBuilder = ArrayBuilder.create(converters, constants);
        this.constantBuilder.updateFromSpec({});
        this.constantBuilder.pushAll();

        this.rangeMap = new Map();
    }

    /**
     *
     * @param {string} key 
     * @param {object} data
     */
    addBatch(key, data) {
        const offset = this.variableBuilder.vertexCount;

        const e = this.encoders;
        const [lower, upper] = this.visibleRange;

        for (const d of data) {
            let x = e.x(d), x2 = e.x2(d);
            
            if (x > x2) {
                [x, x2] = [x2, x];
            }

            // Skip rects that fall outside the visible range. TODO: Optimize by using binary search / interval tree
            if (x2 < lower || x > upper) {
                continue;
            }

            if (x < lower) x = lower;
            if (x2 > upper) x2 = upper;


            let y = e.y(d), y2 = e.y2(d);

            if (y > y2) {
                [y, y2] = [y2, y];
            }

            const width = x2 - x || Math.pow(0.1, 20); // A hack to allow minWidth for zero-height rects.
            const height = y2 - y || Math.pow(0.1, 20); // TODO: Fix the hack

            // Start a new segment. Duplicate the first vertex to produce degenerate triangles
            this.variableBuilder.updateFromSpec(d);
            this.updateX(fp64ify(x));
            this.updateWidth(-width);
            this.updateY(y);
            this.updateHeight(height);
            this.variableBuilder.pushAll();

            // Tesselate segments
            const tileCount = width < Infinity ? Math.ceil(width / this.tesselationThreshold) : 1;
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
                const tx = isFinite(width) ?
                    x + width * frac :
                    i == 0 ? -Infinity : Infinity;

                this.updateX(fp64ify(tx));
                this.updateY(y);
                this.updateHeight(height);
                this.variableBuilder.pushAll();
                this.updateY(y2);
                this.updateHeight(-height);
                this.variableBuilder.pushAll();
            }

            // Duplicate the last vertex to produce a degenerate triangle between the segments
            this.variableBuilder.updateFromSpec(d);
            this.updateX(fp64ify(x2));
            this.updateWidth(width);
            this.updateHeight(-height);
            this.updateY(y2);
            this.variableBuilder.pushAll();
        }

        const count = this.variableBuilder.vertexCount - offset;
        if (count) {
            this.rangeMap.set(key, {
                offset, count 
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
            drawMode: glConst.TRIANGLE_STRIP,
            rangeMap: this.rangeMap
        };
    }
}

export class PointVertexBuilder {
    /**
     * 
     * @param {Object.<string, import("../encoder/encoder").Encoder>} encoders
     */
    constructor(encoders) {

        const e = encoders;

        const c2f = createCachingColor2floatArray();

        const converters = {
            x:                { f: d => fp64ify(e.x(d)),         numComponents: 2 },
            y:                { f: e.y,                          numComponents: 1 },
            size:             { f: d => Math.sqrt(e.size(d)),    numComponents: 1 },
            color:            { f: d => c2f(e.color(d)),         numComponents: 3 },
            opacity:          { f: e.opacity,                    numComponents: 1 },
            zoomThreshold:    { f: e.zoomThreshold,              numComponents: 1 },
            shape:            { f: d => shapes[e.shape(d)] || 0, numComponents: 1 },
            strokeWidth:      { f: e.strokeWidth,                numComponents: 1 },
            gradientStrength: { f: e.gradientStrength,           numComponents: 1 }
        };

        const constants = Object.entries(encoders).filter(e =>  e[1].constant).map(e => e[0]);
        const variables = Object.entries(encoders).filter(e => !e[1].constant).map(e => e[0]);

        this.variableBuilder = ArrayBuilder.create(converters, variables);
        this.constantBuilder = ArrayBuilder.create(converters, constants);

        this.constantBuilder.updateFromSpec({});
        this.constantBuilder.pushAll();

        this.index = 0;
        this.rangeMap = new Map();
    }


    /**
     * 
     * @param {String} key 
     * @param {PointSpec[]} points 
     */
    addBatch(key, points) {
        const offset = this.index;

        for (const p of points) {
            this.variableBuilder.pushFromSpec(p);
            this.index++;
        }

        const count = this.index - offset;
        if (count) {
            this.rangeMap.set(key, {
                offset, count 
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
 * Converts the given segments into typed arrays of vertices
 * 
 * @param {SegmentSpec[]} segments
 * @param {number} [tesselationThreshold] Tesselate segments if they are shorter than the threshold
 */
export function segmentsToVertices(segments, tesselationThreshold = 8000000) {

    const x = [];
    const y = [];
    const colors = [];
    const opacities = [];

    // TODO: This is a bit slow and should be profiled more carefully

    for (let s of segments) {
        // Emulate 64bit floats using two 32bit floats
        const begin = fp64ify(s.interval.lower);
        const end = fp64ify(s.interval.upper);

        const topLeft = 0.0 + (s.paddingTopLeft || s.paddingTop || 0);
        const topRight = 0.0 + (s.paddingTopRight || s.paddingTop || 0);

        const bottomLeft = 1.0 - (s.paddingBottomLeft || s.paddingBottom || 0);
        const bottomRight = 1.0 - (s.paddingBottomRight || s.paddingBottom || 0);

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
        const tileCount = s.interval.width() < Infinity && Math.ceil(s.interval.width() / tesselationThreshold);
        for (let i = 0; i <= tileCount; i++) {
            const r = i / tileCount;
            // Interpolate X & Y
            // TODO: Computation could be optimized a bit. Width is computed repetedly, etc..
            const iX = fp64ify(s.interval.lower + s.interval.width() * r);
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


class ArrayBuilder {
    // TODO: Support strided layout. May yield better performance or not. No consensus in literature.

    /**
     * 
     * @param {*} converters 
     * @param {string[]} attributes Which attributes to include
     */
    static create(converters, attributes) {
        const builder = new ArrayBuilder();

        Object.entries(converters)
            .filter(entry => attributes.includes(entry[0]))
            .forEach(entry => builder.addSpecConverter(entry[0], entry[1].numComponents, entry[1].f));

        return builder;
    }

    constructor() {
        this.arrays = {};

        /** @type {function[]} */
        this.pushers = [];

        /** @type {function[]} */
        this.specConverters = [];

        this.vertexCount = 0;
    }

    /**
     * 
     * @param {string} attributeName 
     * @param {number} numComponents 
     * @param {function} converter
     */
    addSpecConverter(attributeName, numComponents, converter) {
        const updater = this.createUpdater(attributeName, numComponents);
        this.specConverters.push(d => updater(converter(d)));
    }

    /**
     * 
     * @param {string} attributeName 
     * @param {number} numComponents 
     * @return {function(number|number[])}
     */
    createUpdater(attributeName, numComponents) {
        let pendingValue;

        const array = [];
        this.arrays[attributeName] = {
            data: array,
            numComponents: numComponents
        };

        const updater = function(value) {
            pendingValue = value;
        }

        this.pushers.push(
            numComponents == 1 ?
                () => array.push(pendingValue) :
                () => array.push(...pendingValue));

        return updater;
    }

    pushAll() {
        for (const pusher of this.pushers) {
            pusher();
        }
        this.vertexCount++;
    }

    updateFromSpec(spec) {
        for (const converter of this.specConverters) {
            converter(spec);
        }
    }

    pushFromSpec(spec) {
        this.updateFromSpec(spec);
        this.pushAll();
    }

    /**
     * Creates TWGL constant arrays
     */
    toValues() {
        return Object.fromEntries(
            Object.entries(this.arrays)
                .map(entry => [entry[0], { value: entry[1].data }])
        );
    }
}

