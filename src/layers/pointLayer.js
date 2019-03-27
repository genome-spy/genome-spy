import { color } from 'd3-color';
import { tsvParse } from 'd3-dsv';

import { Program, assembleShaders, fp64 } from 'luma.gl';
import { pointsToVertices, verticesToVertexData } from '../gl/segmentsToVertices';
import VERTEX_SHADER from '../gl/pointVertex.glsl';
import FRAGMENT_SHADER from '../gl/pointFragment.glsl';

import { processData } from '../data/dataMapper';

/**
 * PointLayer contains individual genomic loci. For instance, point mutations
 * can be shown on a PointLayer.
 */

// TODO: Make enum, include constraints for ranges, etc, maybe some metadata (description)
const visualVariables = {
    x: { type: "number" },
    color: { type: "color" },
    size: { type: "number" }
};

// TODO: Style object
const maxPointSizeRelative = 0.8;
const maxPointSizeAbsolute = 25;

export default class PointLayer {
    /**
     * @param {import("../tracks/sampleTrack/sampleTrack").default} sampleTrack 
     * @param {Object} layerConfig 
     */
    constructor(sampleTrack, layerConfig) {
        this.layerConfig = layerConfig;

        /** @type {import("../data/dataMapper").VariantDataConfig} */
        this.dataConfig = this.layerConfig.spec;

        this.sampleTrack = sampleTrack;
        this.genomeSpy = sampleTrack.genomeSpy;
    }

    async fetchAndParse(url) {
        return fetch(url)
            .then(data => data.text())
            .then(raw => processData(this.dataConfig, tsvParse(raw), this.genomeSpy.visualMapperFactory));
    }

    async initialize() {

        // TODO: Support "dataSource", immediate data as objects, etc...
        const dataFiles = typeof this.layerConfig.data == "string" ?
            [this.layerConfig.data] :
            this.layerConfig.data;

        const urls = dataFiles.map(filename => this.genomeSpy.config.baseurl + filename);
        const fileResults = await Promise.all(urls.map(url => this.fetchAndParse(url)));

        /**
         * @typedef {import('../gl/segmentsToVertices').PointSpec} PointSpec
         * @type {Map<string, PointSpec[]>}
         */
        this.pointsBySample = new Map();
        for (const map of fileResults) {
            for (const [sample, points] of map) {
                // TODO: Would be more efficient to filter in gather phase
                if (this.sampleTrack.samples.has(sample)) {
                    this.pointsBySample.set(sample, points);

                } else {
                    console.log(`Skipping unknown sample: ${sample}`);
                }
            }
        }

        this._initGL();
    }


    _initGL() {
        const gl = this.sampleTrack.gl;

        this.segmentProgram = new Program(gl, assembleShaders(gl, {
            vs: VERTEX_SHADER,
            fs: FRAGMENT_SHADER,
            modules: ['fp64']
        }));

        
        this.vertexDatas = new Map();

        for (let [sample, points] of this.pointsBySample.entries()) {
            points = points.filter(p => p.size !== 0.0);
            if (points.length) {
                this.vertexDatas.set(
                    sample,
                    verticesToVertexData(this.segmentProgram, pointsToVertices(points)));
            }
        }
    }

    /**
     * @param {string} sampleId 
     * @param {object} uniforms 
     */
    render(sampleId, uniforms) {
        if (this.vertexDatas.has(sampleId)) {
            const gl = this.sampleTrack.gl;

            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

            this.segmentProgram.setUniforms({
                ...uniforms,
                viewportHeight: this.sampleTrack.glCanvas.clientHeight * window.devicePixelRatio,
                devicePixelRatio: window.devicePixelRatio,
                maxPointSizeRelative,
                maxPointSizeAbsolute: maxPointSizeAbsolute * window.devicePixelRatio,
                ...fp64.getUniforms()
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
     * @param {number} domainPos position on the domain
     * @param {number} y position inside the viewport in pixels
     */
    findDatum(sampleId, domainPos, y) {
        // TODO: Fisheye may need some adjustments

        const points = this.pointsBySample.get(sampleId);
        if (!points) {
            return null;
        }

        const bandInterval = this.sampleTrack.sampleScale.scale(sampleId);
        const pointY = bandInterval.centre();

        const maxPointSize = Math.min(maxPointSizeAbsolute, maxPointSizeRelative * bandInterval.width());

        const distance = (x1, x2, y1, y2) => Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

        const scale = this.genomeSpy.rescaledX;

        const x = scale(domainPos);

        // TODO: BinarySearch! First compute the possible range based on the maximum point size...
        // ... and then perform a linear search through it
        let lastMatch = null;
        for (const point of points) {
            const dist = distance(x, scale(point.pos), y, pointY);
            if (dist < maxPointSize * point.size) {
                lastMatch = point;
            }
        }

        return lastMatch ? lastMatch.rawDatum : null;
    }
}
