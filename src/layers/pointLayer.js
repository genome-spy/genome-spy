import { color } from 'd3-color';
import { Program, assembleShaders, fp64 } from 'luma.gl';
import { color2floatArray, verticesToVertexData } from '../gl/segmentsToVertices';
import VERTEX_SHADER from '../gl/pointVertex.glsl';
import FRAGMENT_SHADER from '../gl/pointFragment.glsl';
import SampleTrack from '../tracks/sampleTrack/sampleTrack';

/**
 * PointLayer contains individual genomic loci. For instance, point mutations
 * can be shown on a PointLayer.
 */
export default class PointLayer {
    constructor(pointsBySample) {
        this.pointsBySample = pointsBySample; // TODO: replace with recipe
        // TODO: sort points 
    }

    /**
     * 
     * @param {import("../tracks/sampleTrack/sampleTrack").default} sampleTrack 
     */
    initialize(sampleTrack) {
        this.sampleTrack = sampleTrack;

        const gl = sampleTrack.gl;

        this.segmentProgram = new Program(gl, assembleShaders(gl, {
            vs: VERTEX_SHADER,
            fs: FRAGMENT_SHADER,
            modules: ['fp64']
        }));

        
        this.vertexDatas = new Map();

        const gray = color("gray");

        for (let [sample, points] of this.pointsBySample.entries()) {
            this.vertexDatas.set(
                sample,
                verticesToVertexData(this.segmentProgram, {
                    arrays: {
                        x: {
                            data: new Float32Array(
                                points.map(p => fp64.fp64ify(p.pos)).reduce((a, b) => { a.push(...b); return a; }, [])),
                            accessor: { size: 2 } /* gl.STATIC_DRAW */
                        },
                        size: new Float32Array(points.map(p => p.size)),
                        color: { data:
                            new Float32Array(
                                points.map(p => color2floatArray(p.color || gray)).reduce((a, b) => { a.push(...b); return a; }, [])),
                            accessor: { size: 4 }
                        }
                    },
                    vertexCount: points.length,
                    drawMode: gl.POINTS
                }));
        }
    }

    /**
     * @param {string} sampleId 
     * @param {object} uniforms 
     */
    render(sampleId, uniforms) {
        if (this.pointsBySample.has(sampleId)) {
            const gl = this.sampleTrack.gl;

            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

            this.segmentProgram.setUniforms({
                ...uniforms,
                viewportHeight: this.sampleTrack.glCanvas.clientHeight * window.devicePixelRatio,
                devicePixelRatio: window.devicePixelRatio,
                maxPointSizeRelative: 0.7,
                maxPointSizeAbsolute: 20 * window.devicePixelRatio,
                ONE: 1.0, // WTF: https://github.com/uber/luma.gl/pull/622
            });
            this.segmentProgram.draw({
                ...this.vertexDatas.get(sampleId),
                uniforms: null // Explicityly specify null to prevent erroneous deprecation warning
            });

            gl.disable(gl.BLEND);
        }
    }

    /**
     * @param {string} sampleId 
     * @param {number} pos position on the domain
     */
    findDatum(sampleId, pos) {
        return;
        /*
        const rects = this.rectsBySample.get(sampleId);

        // TODO: BinarySearch
        const rect = rects.find(rect => rect.interval.contains(pos));

        return rect ? rect.rawDatum : null;
        */
    }
}
