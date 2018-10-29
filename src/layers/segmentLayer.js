import { RectangleModel } from '../glModels/rectangleModel';

/**
 * Segment layer contains genomic segments that may represent
 * copy number variation, for example.
 */
export default class SegmentLayer {
    constructor(rectsBySample) {
        this.rectsBySample = rectsBySample; // TODO: replace with recipe
    }

    initialize({sampleTrack}) {
        this.sampleTrack = sampleTrack;

        // TODO: Omit unknown samples
        // Each sample gets its own RectangleModel, which contains all segments of the given sample
        this.models = new Map(Array.from(this.rectsBySample.entries())
            .map(entry => [
                entry[0],
                new RectangleModel(sampleTrack.gl, entry[1], { shaderCache: sampleTrack.shaderCache })
            ]));
    }

    render(sampleId, uniforms) {
        this.models.get(sampleId).render(uniforms);
    }
}