import { color as d3color } from 'd3-color';
import { VertexArray, Buffer, fp64 } from 'luma.gl';
import Interval from "../utils/interval";

const black = d3color("black");
const gray = d3color("gray");

// https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Constants
// TODO: Use @luma.gl/constants 
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

    // TODO: This is a bit slow and should be profiled more carefully

    for (let s of segments) {
        // Emulate 64bit floats using two 32bit floats
        const begin = fp64.fp64ify(s.interval.lower);
        const end = fp64.fp64ify(s.interval.upper);

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

        // Tesselate segments
        const tileCount = Math.ceil(s.interval.width() / tesselationThreshold);
        for (let i = 0; i <= tileCount; i++) {
            const r = i / tileCount;
            // Interpolate X & Y
            // TODO: Computation could be optimized a bit. Width is computed repetedly, etc..
            const iX = fp64.fp64ify(s.interval.lower + s.interval.width() * r);
            const iBottom = bottomLeft + (bottomRight - bottomLeft) * r;
            const iTop = topLeft + (topRight - topLeft) * r;
            x.push(...iX, ...iX);
            y.push(iBottom, iTop);
            colors.push(...bc, ...tc);
        }

        // Duplicate the last vertex to produce a degenerate triangle between the segments
        x.push(...end);
        y.push(topRight);
        colors.push(...tc);
    }

    return {
        arrays: {
            x: { data: new Float32Array(x), accessor: { size: 2 } },
            y: { data: new Float32Array(y) },
            color: { data: new Float32Array(colors), accessor: { size: 4 } }
        },
        vertexCount: y.length,
        drawMode: glConst.TRIANGLE_STRIP
    };
}


/**
 * @typedef {Object} PointSpec
 * @prop {number} pos
 * @prop {number} [size]
 * @prop {Object} [color]
 * TODO: y, symbol, orientation, aspectRatio
 */

/**
 * Converts the given points into typed arrays of vertices
 * 
 * @param {PointSpec[]} points
 */
export function pointsToVertices(points) {

    points = points.filter(p => p.size !== 0.0);

    const x = points.map(p => fp64.fp64ify(p.pos)).reduce((a, b) => { a.push(...b); return a; }, []);
    const size = points.map(p => typeof p.size == "number" ? Math.sqrt(p.size) : 1.0);
    const color = points.map(p => color2floatArray(p.color || gray)).reduce((a, b) => { a.push(...b); return a; }, []);

    return {
        arrays: {
            x: { data: new Float32Array(x), accessor: { size: 2 } },
            size: { data: new Float32Array(size) },
            color: { data: new Float32Array(color), accessor: { size: 4 } }
        },
        vertexCount: points.length,
        drawMode: glConst.POINTS
    };
}

/**
 * 
 * @param {*} program 
 * @param {*} vertices 
 */
export function verticesToVertexData(program, vertices) {
    const gl = program.gl;
    const vertexArray = new VertexArray(gl, { program });

    const mapMembers = (obj, f) => 
        Object.assign({}, ...Object.keys(obj).map(k => ({[k]: f(obj[k])})));

    // Put each TypedArray into a Buffer
    vertexArray.setAttributes(mapMembers(vertices.arrays,
        obj => new Buffer(gl, { ...obj, usage: glConst.STATIC_DRAW })));

    return {
        vertexArray: vertexArray,
        vertexCount: vertices.vertexCount,
        drawMode: vertices.drawMode
    };
}