import { group, extent } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import { color as d3color } from 'd3-color';
import { tsvParse } from 'd3-dsv';

import { Program, assembleShaders } from 'luma.gl';
import VERTEX_SHADER from '../gl/rectangleVertex.glsl';
import FRAGMENT_SHADER from '../gl/rectangleFragment.glsl';
import { segmentsToVertices, verticesToVertexData } from '../gl/segmentsToVertices';

/**
 * Segment layer contains genomic segments that may represent
 * copy number variation, for example.
 */
export default class SegmentLayer {

    /**
     * @param {import("../tracks/sampleTrack/sampleTrack").default} sampleTrack 
     * @param {Object} layerConfig 
     */
    constructor(sampleTrack, layerConfig) {
        this.layerConfig = layerConfig;

        this.dataConfig = this.layerConfig.spec;

        this.sampleTrack = sampleTrack;
        this.genomeSpy = sampleTrack.genomeSpy;
    }

    /**
     * 
     */
    async initialize() {
        await this.createCnvLohSegments();

        this._initGL();
    }

    async createCnvLohSegments() {
        const spec = this.dataConfig;
        const cm = this.genomeSpy.genome.chromMapper;

        const segmentations = tsvParse(
            await fetch(this.genomeSpy.config.baseurl + this.layerConfig.data).then(res => res.text()));

        const bySample = group(segmentations, d => d[spec.sample]);

        const colorScale = scaleLinear()
            .domain([-3, 0, 1.5]) // TODO: Infer from data
            .range(["#0050f8", "#f6f6f6", "#ff3000"]);

        const transform = spec.logSeg ? (x => x) : Math.log2;

        const extractInterval = segment => cm.segmentToContinuous(
            segment[spec.chrom],
            parseInt(segment[spec.start]),
            parseInt(segment[spec.end]));

        const baf2loh = baf => (Math.abs(baf) - 0.5) * 2;

        // TODO: Precompute colors for the domain and use a lookup table. This is currently a bit slow.

        this.rectsBySample = new Map();

        for (const [sample, segments] of bySample.entries()) {
            const rects = [];
            for (const segment of segments) {
                const interval = extractInterval(segment);
                const color = d3color(colorScale(transform(parseFloat(segment[spec.segMean]))));
                const loh = spec.bafMean ? baf2loh(parseFloat(segment[spec.bafMean])) : 0;

                rects.push(
                    {
                        interval,
                        paddingBottom: loh,
                        color,
                        rawDatum: segment
                    }
                );

                if (loh) {
                    rects.push(
                        {
                            interval,
                            paddingTop: 1.0 - loh,
                            color: color.darker(0.5).rgb(),
                            rawDatum: segment
                        }
                    )
                };
            }

            this.rectsBySample.set(sample, rects);
        }
    }

    _initGL() {
        const gl = this.sampleTrack.gl;

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