import * as d3 from "d3";
import { VertexArray, Buffer, fp64 } from 'luma.gl';
import Interval from "../utils/interval";

const black = d3.color("black");

function color2floatArray(color) {
    return [color.r / 255.0, color.g / 255.0, color.b / 255.0, color.opacity];
}

/**
 * 
 * @param {*} program 
 * @param {object[]} segments 
 */
export default function segmentsToVertices(program, segments) {
    // Tesselate segments if they are shorter than the given minimum width
    // TODO: Configurable
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


    const gl = program.gl;
    const vertexArray = new VertexArray(gl, { program });

    vertexArray.setAttributes({
        x: new Buffer(gl, { data: new Float32Array(x), size: 2, usage: gl.STATIC_DRAW }),
        y: new Buffer(gl, { data: new Float32Array(y), size: 1, usage: gl.STATIC_DRAW }),
        color: new Buffer(gl, { data: new Float32Array(colors), size: 4, usage: gl.STATIC_DRAW })
    });

    return {
        vertexArray: vertexArray,
        vertexCount: y.length
    };
}