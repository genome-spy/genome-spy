import { Program, assembleShaders } from 'luma.gl';
import VERTEX_SHADER from '../gl/rectangleVertex.glsl';
import FRAGMENT_SHADER from '../gl/rectangleFragment.glsl';
import { segmentsToVertices, verticesToVertexData } from '../gl/segmentsToVertices';

/**
 * Segment layer contains genomic segments that may represent
 * copy number variation, for example.
 */
export default class SegmentLayer {
    constructor(rectsBySample) {
        this.rectsBySample = rectsBySample; // TODO: replace with recipe
        // TODO: sort rects
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

        // TODO: Omit unknown samples
        this.vertexDatas = new Map(Array.from(this.rectsBySample.entries())
            .map(entry => [
                entry[0],
                verticesToVertexData(this.segmentProgram, segmentsToVertices(entry[1]))
            ]));
    }

    /**
     * @param {string} sampleId 
     * @param {object} uniforms 
     */
    render(sampleId, uniforms) {
        this.segmentProgram.setUniforms({
            ...uniforms,
            ONE: 1.0, // WTF: https://github.com/uber/luma.gl/pull/622
        });
        this.segmentProgram.draw({
            ...this.vertexDatas.get(sampleId),
            uniforms: null // Explicityly specify null to prevent erroneous deprecation warning
        });
    }

    /**
     * @param {string} sampleId 
     * @param {number} pos position on the domain
     */
    findDatum(sampleId, pos) {
        const rects = this.rectsBySample.get(sampleId);

        // TODO: BinarySearch
        const rect = rects.find(rect => rect.interval.contains(pos));

        return rect ? rect.rawDatum : null;
    }
}