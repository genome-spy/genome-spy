import { Program, assembleShaders } from 'luma.gl';
import VERTEX_SHADER from '../gl/rectangleVertex.glsl';
import FRAGMENT_SHADER from '../gl/rectangleFragment.glsl';
import segmentsToVertices from '../gl/segmentsToVertices';

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
     * @param {import("../tracks/sampleTrack").default} sampleTrack 
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
        this.vertices = new Map(Array.from(this.rectsBySample.entries())
            .map(entry => [
                entry[0],
                segmentsToVertices(this.segmentProgram, entry[1])
            ]));
    }

    /**
     * @param {string} sampleId 
     * @param {object} uniforms 
     */
    render(sampleId, uniforms) {
        this.segmentProgram.draw(Object.assign(
            {
                uniforms: Object.assign({ ONE: 1.0 }, uniforms) // WTF: https://github.com/uber/luma.gl/pull/622
            },
            this.vertices.get(sampleId)
        ));
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