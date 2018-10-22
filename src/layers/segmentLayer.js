import { RectangleModel } from '../glModels/rectangleModel';

/**
 * Segment layer contains genomic segments that may represent
 * copy number variation, for example.
 */
export default class SegmentLayer {
    constructor(rectsBySample) {
        this.rectsBySample = rectsBySample; // TODO: replace with recipe
    }

    initialize({sampleTrack, gl}) {
        this.sampleTrack = sampleTrack;

        // TODO: Omit unknown samples
        // Each sample gets its own RectangleModel, which contains all segments of the given sample
        // entries() return an iterator. Array.from is ugly, but performance doesn't matter here.
        this.models = new Map(Array.from(this.rectsBySample.entries())
            .map(entry => [
                entry[0],
                new RectangleModel(gl, entry[1], { shaderCache: sampleTrack.shaderCache })
            ]));
    }

    render(sampleId, gl, uniforms) {
        this.models.get(sampleId).render(uniforms);
    }


}



function cnvSegRecipe() {
    const colorScale = d3.scaleLinear()
        .domain([-3, 0, 1.5])
        .range(["#0040f8", "#f6f6f6", "#ff2800"]);
}