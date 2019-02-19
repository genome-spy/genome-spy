import { color } from 'd3-color';
import { VertexArray, Buffer, fp64 } from 'luma.gl';
import Interval from "../utils/interval";

const black = color("black");

function color2floatArray(color) {
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
 */
export function segmentsToVertices(gl, segments) {
    // Tesselate segments if they are shorter than the given minimum width
    // TODO: Use GL TriangleStrip
    // TODO: ConfigurableThreshold
    const tesselationThreshold = 10000000;

    const x = [];
    const y = [];
    const colors = [];

    for (let s of segments) {
        let tiles;
        if (s.interval.width() > tesselationThreshold) {
            tiles = [];
            const tileCount = Math.ceil(s.interval.width() / tesselationThreshold);
            const tileWidth = s.interval.width() / tileCount;

            for (let i = 0; i < tileCount; i++) {
                const interval = new Interval(
                    s.interval.lower + i * tileWidth,
                    s.interval.lower + (i + 1) * tileWidth);
                
                const tile = Object.assign({}, s);
                // TODO: Interpolate paddings
                tile.interval = interval;

                tiles.push(tile);
            }

        } else {
            tiles = [s];
        }

        for (let t of tiles) {
            const begin = fp64.fp64ify(t.interval.lower);
            const end = fp64.fp64ify(t.interval.upper);

            const topLeft = 0.0 + (t.paddingTopLeft || t.paddingTop || 0);
            const topRight = 0.0 + (t.paddingTopRight || t.paddingTop || 0);

            const bottomLeft = 1.0 - (t.paddingBottomLeft || t.paddingBottom || 0);
            const bottomRight = 1.0 - (t.paddingBottomRight || t.paddingBottom || 0);

            const color = t.color || black;
            const colorTop = t.colorTop || color;
            const colorBottom = t.colorBottom || color;

            // TODO: Use int8 color components instead of floats
            const tc = color2floatArray(colorTop);
            const bc = color2floatArray(colorBottom);

            // Create quads from two triangles
            // TODO: Spreading and pushing is slow. Figure out something...
            x.push(...begin, ...end, ...begin, ...end, ...begin, ...end);
            y.push(bottomLeft, bottomRight, topLeft, topRight, topLeft, bottomRight);
            colors.push(...bc, ...bc, ...tc, ...tc, ...tc, ...bc);
        }
    }

    return {
        arrays: {
            x: { data: new Float32Array(x), size: 2, usage: gl.STATIC_DRAW },
            y: { data: new Float32Array(y), size: 1, usage: gl.STATIC_DRAW },
            color: { data: new Float32Array(colors), size: 4, usage: gl.STATIC_DRAW }
        },
        vertexCount: y.length,
        drawMode: gl.TRIANGLES
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

    vertexArray.setAttributes(mapMembers(vertices.arrays, obj => new Buffer(gl, obj)));

    return {
        vertexArray: vertexArray,
        vertexCount: vertices.vertexCount,
        drawMode: vertices.drawMode
    };
}