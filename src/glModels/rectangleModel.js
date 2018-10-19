import { Program, Geometry, Model, fp64 } from 'luma.gl';

const VERTEX_SHADER = `\
precision highp float;

attribute vec2 x;
attribute float y;
attribute vec4 color;

uniform mat4 uTMatrix;
uniform vec2 uDomainBegin;
uniform vec2 uDomainWidth;

varying vec4 vColor;

const float precisionThreshold = 1024.0 * 1024.0 * 64.0;

void main(void) {
    
    float impreciseX;

    if (uDomainWidth.x < precisionThreshold) {
        vec2 translated = sub_fp64(x, uDomainBegin);
        vec2 normalizedX = div_fp64(translated, uDomainWidth);

        impreciseX = normalizedX.x;

    } else {
        impreciseX = (x.x - uDomainBegin.x) / uDomainWidth.x;
    }

    gl_Position = uTMatrix * vec4(impreciseX, y, 0.0, 1.0);

    vColor = color;
}
`;

const FRAGMENT_SHADER = `\
//precision highp float;

varying vec4 vColor;

void main(void) {
  gl_FragColor = vColor;
}
`;

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
        })

        super(gl, {
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