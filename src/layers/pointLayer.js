import { color } from 'd3-color';
import { tsvParse } from 'd3-dsv';

import { Program, assembleShaders, fp64 } from 'luma.gl';
import { pointsToVertices, verticesToVertexData } from '../gl/segmentsToVertices';
import VERTEX_SHADER from '../gl/pointVertex.glsl';
import FRAGMENT_SHADER from '../gl/pointFragment.glsl';

import { gather, formalizeEncodingConfig, createEncodingMapper, createFilter } from '../utils/visualScales';

/**
 * PointLayer contains individual genomic loci. For instance, point mutations
 * can be shown on a PointLayer.
 */

// TODO: Make enum, include constraints for ranges, etc, maybe some metadata (description)
const visualVariables = {
    color: { type: "color" },
    size: { type: "number" }
};

const maxPointSizeRelative = 0.8;
const maxPointSizeAbsolute = 25;

export default class PointLayer {
    /**
     * @param {import("../tracks/sampleTrack/sampleTrack").default} sampleTrack 
     * @param {Object} layerConfig 
     */
    constructor(sampleTrack, layerConfig) {
        this.layerConfig = layerConfig;

        /* @type {import("../utils/visualScales").VariantDataConfig} */
        this.dataConfig = this.layerConfig.spec;

        this.sampleTrack = sampleTrack;
        this.genomeSpy = sampleTrack.genomeSpy;
    }

    processData(rows) {
        const cm = this.genomeSpy.genome.chromMapper;

        // TODO: Move parsing, gathering, etc logic to a separate module

        /**
         * Now we assume that attribute is gathered if it is not in shared.
         * TODO: Throw an exception if it's was not published from gathered data
         */
        const isShared = attribute => rows.columns.indexOf(attribute) >= 0;

        const createCompositeMapper = (
        /** @type {function(string):boolean} */inclusionPredicate,
        /** @type {object[]} */sampleData
        ) => {
            const mappers = {};

            Object.entries(this.dataConfig.encodings || {})
                .forEach(([/** @type {string} */visualVariable, /** @type {EncodingConfig} */encodingConfig]) => {
                    if (!visualVariables[visualVariable]) {
                        throw `Unknown visual variable: ${visualVariable}`;
                    }

                    encodingConfig = formalizeEncodingConfig(encodingConfig);

                    if (inclusionPredicate(encodingConfig.attribute)) {
                        mappers[visualVariable] = createEncodingMapper(
                            visualVariables[visualVariable].type,
                            encodingConfig,
                            sampleData)
                    }
                });

            const compositeMapper = d => {
                const mapped = {}
                Object.entries(mappers).forEach(([visualVariable, mapper]) => {
                    mapped[visualVariable] = mapper(d);
                });
                return mapped;
            };

            // Export for tooltips
            compositeMapper.mappers = mappers;

            return compositeMapper;
        }


        const createCompositeFilter = (
        /** @type {function(string):boolean} */inclusionPredicate
        ) => {
            // Trivial case
            if (!this.dataConfig.filters || this.dataConfig.filters.length <= 0) {
                return d => true;
            }

            const filterInstances = this.dataConfig.filters
                .filter(filter => inclusionPredicate(filter.attribute))
                .map(createFilter)

            return d => filterInstances.every(filter => filter(d));
        }


        const filterSharedVariables = createCompositeFilter(isShared);

        // Columns property was added by d3.dsv. Filter drops it. Have to add it back
        const columns = rows.columns;
        rows = rows.filter(filterSharedVariables);
        rows.columns = columns;

        const gatheredSamples = gather(rows, this.dataConfig.gather);

        const mapSharedVariables = createCompositeMapper(isShared, rows);

        // TODO: Maybe sampleData could be iterable
        const mapSampleVariables = gatheredSamples.size > 0 ?
            createCompositeMapper(x => !isShared(x), Array.prototype.concat.apply([], [...gatheredSamples.values()])) :
            x => ({});

        const filterSampleVariables = createCompositeFilter(x => !isShared(x));

        const sharedVariantVariables = rows
            .map(d => ({
                // TODO: 0 or 1 based addressing?
                // Add 0.5 to center the symbol inside nucleotide boundaries
                pos: cm.toContinuous(d[this.dataConfig.chrom], +d[this.dataConfig.pos]) + 0.5,
                ...mapSharedVariables(d)
            }));

        /**
         * @typedef {import('../gl/segmentsToVertices').PointSpec} PointSpec
         * @type {Map<string, PointSpec[]>}
         */
        const pointsBySample = new Map();

        for (const [sampleId, gatheredRows] of gatheredSamples) {
            /** @type {PointSpec[]} */
            const combined = [];

            for (let i = 0; i < sharedVariantVariables.length; i++) {
                const gathered = gatheredRows[i];
                if (filterSampleVariables(gathered)) {
                    combined.push({
                        ...sharedVariantVariables[i],
                        ...mapSampleVariables(gathered),
                        rawDatum: rows[i]
                    });
                }
            }

            if (combined.length) {
                pointsBySample.set(sampleId, combined);
            }
        }

        return pointsBySample;
    }

    async fetchAndParse(url) {
        return fetch(url)
            .then(data => data.text())
            .then(raw => this.processData(tsvParse(raw)));
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
                this.pointsBySample.set(sample, points);
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
            this.vertexDatas.set(
                sample,
                verticesToVertexData(this.segmentProgram, pointsToVertices(points)));
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
