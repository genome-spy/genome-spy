import { color as d3color } from 'd3-color';
import { fp64ify } from './includes/fp64-utils';
import Interval from "../utils/interval";

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

export function color2floatArray(color) {
    if (typeof color == "string") {
        color = d3color(color);
    }
    return [color.r / 255.0, color.g / 255.0, color.b / 255.0];
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
     * @param {number} [tesselationThreshold]
     *     If the rect is narrower than the threshold, tesselate it into pieces
     */
    constructor(constants, variables, tesselationThreshold = Infinity) {
        // TODO: Provide default values and provide them as constants

        this.tesselationThreshold = tesselationThreshold;

        const converters = {
            color: { f: spec => color2floatArray(spec.color), numComponents: 3 },
            opacity: { f: spec => spec.opacity, numComponents: 1 },
        };

        this.constants = constants || {};

        this.variableBuilder = ArrayBuilder.create(converters, variables);

        this.updateX = this.variableBuilder.createUpdater("x", 2);
        this.updateY = this.variableBuilder.createUpdater("y", 1);
        this.updateWidth = this.variableBuilder.createUpdater("width", 1);

        this.constantBuilder = ArrayBuilder.create(converters, Object.keys(constants));
        this.constantBuilder.updateFromSpec(
            Object.fromEntries(Object.entries(constants)
                    .map(entry => [entry[0], entry[1]])));
        this.constantBuilder.pushAll();

        this.rangeMap = new Map();
    }

    /**
     *
     * @param {string} key 
     * @param {RectSpec[]} rects 
     */
    addBatch(key, rects) {
        const offset = this.variableBuilder.vertexCount;

        for (let r of rects) {
            const [x, x2] = r.x <= r.x2 ? [r.x, r.x2] : [r.x2, r.x];
            const [y, y2] = r.y <= r.y2 ? [r.y, r.y2] : [r.y2, r.y];

            const width = x2 - x;

            if (!(p => p.x2 > p.x && p.y2 > p.y && p.opacity !== 0)) continue;

            // Start a new segment. Duplicate the first vertex to produce degenerate triangles
            this.variableBuilder.updateFromSpec(r);
            this.updateX(fp64ify(x));
            this.updateWidth(-width);
            this.updateY(y);
            this.variableBuilder.pushAll();

            // Tesselate segments
            const tileCount = Math.ceil(width / this.tesselationThreshold) || 1;
            for (let i = 0; i <= tileCount; i++) {
                const frac = i / tileCount;

                let w = 0;
                if (i == 0) {
                    w = -width;
                } else if (i >= tileCount) {
                    w = width;
                }

                this.updateWidth(w);
                this.updateX(fp64ify(r.x + width * frac));
                this.updateY(y);
                this.variableBuilder.pushAll();
                this.updateY(y2);
                this.variableBuilder.pushAll();
            }

            // Duplicate the last vertex to produce a degenerate triangle between the segments
            this.variableBuilder.updateFromSpec(r);
            this.updateX(fp64ify(x2));
            this.updateWidth(width);
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
     * @param {Object.<string, any[]>} constants
     * @param {string[]} variables names of variables
     */
    constructor(constants, variables) {

        // TODO: Provide default values and provide them as constants

        const converters = {
            x:       { f: spec => fp64ify(spec.x),              numComponents: 2 },
            y:       { f: spec => spec.y,                       numComponents: 1 },
            size:    { f: spec => Math.sqrt(spec.size),         numComponents: 1 },
            color:   { f: spec => color2floatArray(spec.color), numComponents: 3 },
            opacity: { f: spec => spec.opacity,                 numComponents: 1 },
            zoomThreshold: { f: spec => spec.zoomThreshold,   numComponents: 1 },
        };

        this.constants = constants || {};

        this.variableBuilder = ArrayBuilder.create(converters, variables);

        this.constantBuilder = ArrayBuilder.create(converters, Object.keys(constants));
        this.constantBuilder.updateFromSpec(
            Object.fromEntries(Object.entries(this.constants)
                    .map(entry => [entry[0], entry[1]])));
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
        const tileCount = Math.ceil(s.interval.width() / tesselationThreshold);
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
        this.specConverters.push(spec => updater(converter(spec)));
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

