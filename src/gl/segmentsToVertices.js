import { color } from 'd3-color';
import { VertexArray, Buffer, fp64 } from 'luma.gl';
import Interval from "../utils/interval";

const black = color("black");

export function color2floatArray(color) {
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
 * @prop {number} [color]
 * @prop {number} [colorTop]
 * @prop {number} [colorBottom]
 */

/**
 * Converts the given segments into typed arrays of vertices
 * 
 * @param {WebGLRenderingContext} gl Used for constants. Vertices are not bound to the context.
 * @param {SegmentSpec[]} segments
 * @param {number} [tesselationThreshold] Tesselate segments if they are shorter than the threshold
 */
export function segmentsToVertices(gl, segments, tesselationThreshold = 8000000) {

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
            x: { data: new Float32Array(x), accessor: { size: 2 }, usage: gl.STATIC_DRAW },
            y: { data: new Float32Array(y), usage: gl.STATIC_DRAW },
            color: { data: new Float32Array(colors), accessor: { size: 4 }, usage: gl.STATIC_DRAW }
        },
        vertexCount: y.length,
        drawMode: gl.TRIANGLE_STRIP
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
    vertexArray.setAttributes(mapMembers(vertices.arrays, obj => new Buffer(gl, obj)));

    return {
        vertexArray: vertexArray,
        vertexCount: vertices.vertexCount,
        drawMode: vertices.drawMode
    };
}