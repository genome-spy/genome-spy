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
    return [color.r / 255.0, color.g / 255.0, color.b / 255.0, color.opacity];
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
    constructor(tesselationThreshold = Infinity) {
        this.tesselationThreshold = tesselationThreshold;

        this.xArr = [];
        this.widthArr = [];
        this.yArr = [];
        this.colorArr = [];
        this.opacityArr = [];

        this.rangeMap = new Map();
    }

    /**
     * 
     * @param {string} key 
     * @param {RectSpec[]} rects 
     */
    addBatch(key, rects) {
        const offset = this.yArr.length;

        for (let r of rects) {
            const [x, x2] = r.x <= r.x2 ? [r.x, r.x2] : [r.x2, r.x];
            const [y, y2] = r.y <= r.y2 ? [1 - r.y, 1 - r.y2] : [1 - r.y2, 1 - r.y];

            const width = x2 - x;

            const color = r.color || black;
            const opacity = typeof r.opacity == "number" ? r.opacity : 1;


            if (!(p => p.x2 > p.x && p.y2 > p.y && p.opacity !== 0)) continue;

            // TODO: Conserve memory, use int8 color components instead of floats...
            // ... or store the raw value and scale it in the vertex shader
            const c = color2floatArray(color);

            // Start a new segment. Duplicate the first vertex to produce degenerate triangles
            this.xArr.push(...fp64ify(x));
            this.widthArr.push(-width);
            this.yArr.push(y);
            this.colorArr.push(...c);
            this.opacityArr.push(opacity);

            // Tesselate segments
            const tileCount = Math.ceil(width / this.tesselationThreshold) || 1;
            for (let i = 0; i <= tileCount; i++) {
                const frac = i / tileCount;
                // Interpolate X & Y
                // Emulate 64bit floats using two 32bit floats
                const iX = fp64ify(r.x + width * frac);
                this.xArr.push(...iX, ...iX);
                this.yArr.push(y, y2);
                this.colorArr.push(...c, ...c);
                this.opacityArr.push(opacity, opacity);

                let w = 0;
                if (i == 0) {
                    w = -width;
                } else if (i >= tileCount) {
                    w = width;
                }
                this.widthArr.push(w, w);
            }

            // Duplicate the last vertex to produce a degenerate triangle between the segments
            this.xArr.push(...fp64ify(x2));
            this.widthArr.push(width);
            this.yArr.push(y2);
            this.colorArr.push(...c);
            this.opacityArr.push(opacity);
        }

        const count = this.yArr.length - offset;
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
                x:       { data: new Float32Array(this.xArr), numComponents: 2 },
                y:       { data: new Float32Array(this.yArr), numComponents: 1 },
                width:   { data: new Float32Array(this.widthArr), numComponents: 1 },
                color:   { data: new Float32Array(this.colorArr), numComponents: 4 },
                opacity: { data: new Float32Array(this.opacityArr), numComponents: 1 }
            },
            vertexCount: this.yArr.length,
            drawMode: glConst.TRIANGLE_STRIP,
            rangeMap: this.rangeMap
        };
    }
}

export class PointVertexBuilder {
    constructor() {
        this.xArr = [];
        this.sizeArr = [];
        this.colorArr = [];
        this.thresholdArr = [];
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
            this.xArr.push(...fp64ify(p.x));
            this.sizeArr.push(typeof p.size == "number" ? Math.sqrt(p.size) : 1.0);
            this.colorArr.push(...color2floatArray(p.color || gray));
            this.thresholdArr.push(p.zoomThreshold || 1.0);

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
                x:     { data: new Float32Array(this.xArr), numComponents: 2 },
                size:  { data: new Float32Array(this.sizeArr), numComponents: 1 },
                color: { data: new Float32Array(this.colorArr), numComponents: 4 },
                zoomThreshold: { data: new Float32Array(this.thresholdArr), numComponents: 1 }
            },
            vertexCount: this.index,
            drawMode: glConst.POINTS,
            rangeMap: this.rangeMap
        };
    }
}

/**
 * Converts the given rects into typed arrays of vertices
 * 
 * @deprecated Use RectVertexBuilder
 * @param {RectSpec[]} rects 
 * @param {number} [tesselationThreshold] Tesselate segments if they are shorter than the threshold
 */
export function rectsToVertices(rects, tesselationThreshold = 8000000) {

    const xArr = [];
    const widthArr = [];
    const yArr = [];
    const colorArr = [];
    const opacityArr = [];

    // TODO: This is a bit slow and should be profiled more carefully

    for (let r of rects) {
        const [x, x2] = r.x <= r.x2 ? [r.x, r.x2] : [r.x2, r.x];
        const [y, y2] = r.y <= r.y2 ? [1 - r.y, 1 - r.y2] : [1 - r.y2, 1 - r.y];

        const width = x2 - x;

        const color = r.color || black;
        const opacity = typeof r.opacity == "number" ? r.opacity : 1;

        // TODO: Conserve memory, use int8 color components instead of floats
        const c = color2floatArray(color);

        // Start a new segment. Duplicate the first vertex to produce degenerate triangles
        xArr.push(...fp64ify(x));
        widthArr.push(-width);
        yArr.push(y);
        colorArr.push(...c);
        opacityArr.push(opacity);

        // Tesselate segments
        const tileCount = Math.ceil(width / tesselationThreshold);
        for (let i = 0; i <= tileCount; i++) {
            const frac = i / tileCount;
            // Interpolate X & Y
            // Emulate 64bit floats using two 32bit floats
            const iX = fp64ify(r.x + width * frac);
            xArr.push(...iX, ...iX);
            yArr.push(y, y2);
            colorArr.push(...c, ...c);
            opacityArr.push(opacity, opacity);

            let w = 0;
            if (i == 0) {
                w = -width;
            } else if (i >= tileCount) {
                w = width;
            }
            widthArr.push(w, w);
        }

        // Duplicate the last vertex to produce a degenerate triangle between the segments
        xArr.push(...fp64ify(x2));
        widthArr.push(width);
        yArr.push(y2);
        colorArr.push(...c);
        opacityArr.push(opacity);
    }

    return {
        arrays: {
            x: { data: new Float32Array(xArr), numComponents: 2 },
            y: { data: new Float32Array(yArr), numComponents: 1 },
            width: { data: new Float32Array(widthArr), numComponents: 1  },
            color: { data: new Float32Array(colorArr), numComponents: 4 },
            opacity: { data: new Float32Array(opacityArr), numComponents: 1  }
        },
        vertexCount: yArr.length,
        drawMode: glConst.TRIANGLE_STRIP
    };
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
            color: { data: new Float32Array(colors), numComponents: 4 },
            opacity: { data: new Float32Array(opacities), numComponents: 1 }
        },
        vertexCount: y.length,
        drawMode: glConst.TRIANGLE_STRIP
    };
}

