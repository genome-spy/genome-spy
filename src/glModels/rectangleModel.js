import { Program, Geometry, Model, fp64 } from 'luma.gl';
import VERTEX_SHADER from './rectangleModelVertex.glsl';
import FRAGMENT_SHADER from './rectangleModelFragment.glsl';

export class RectangleModel extends Model {
    constructor(gl, segments, opts = {}) {

        const VERTICES_PER_RECTANGLE = 6;
        const x = new Float32Array(segments.length * VERTICES_PER_RECTANGLE * 2);
        const y = new Float32Array(segments.length * VERTICES_PER_RECTANGLE);
        const color = new Float32Array(segments.length * VERTICES_PER_RECTANGLE * 4);
        
        segments.forEach((s, i) => {
            const begin = fp64.fp64ify(s.begin * 1.0);
            const end = fp64.fp64ify(s.end * 1.0);
            const top = 0.0 + (s.paddingTop ? s.paddingTop : 0);
            const bottom = 1.0 - (s.paddingBottom ? s.paddingBottom : 0);

            x.set([].concat(begin, end, begin, end, begin, end), i * VERTICES_PER_RECTANGLE * 2);
            y.set([bottom, bottom, top, top, top, bottom], i * VERTICES_PER_RECTANGLE);
            const c = [s.color.r / 255.0, s.color.g / 255.0, s.color.b / 255.0, s.color.opacity];
            color.set([].concat(c, c, c, c, c, c), i * VERTICES_PER_RECTANGLE * 4);
        });

        super(gl, {
            shaderCache: opts.shaderCache,
            fs: FRAGMENT_SHADER,
            vs: VERTEX_SHADER,
            modules: [fp64],
            geometry: new Geometry({
                attributes: {
                    x: { value: x, size: 2},
                    y: { value: y, size: 1},
                    color: { value: color, size: 4 },
                }
            }),
            vertexCount: y.length,
            drawMode: gl.TRIANGLES,

            uniforms: {
                ONE: 1.0 // WTF: https://github.com/uber/luma.gl/pull/622
                // uSampler: opts.texture
            },
            onBeforeRender() {
            }
        });

        /*
        this.angle = 0;
        this.dist = opts.startingDistance;
        this.rotationSpeed = opts.rotationSpeed;
        this.spin = 0;
    
        this.randomiseColors();
        */
    }
}