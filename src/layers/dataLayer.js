import { color } from 'd3-color';
import { tsvParse } from 'd3-dsv';
import { processData } from '../data/dataMapper';

export default class DataLayer {

    /**
     * @param {import("../tracks/sampleTrack/sampleTrack").default} sampleTrack 
     * @param {Object} layerConfig 
     */
    constructor(sampleTrack, layerConfig) {
        this.layerConfig = layerConfig;

        this.sampleTrack = sampleTrack;
        this.genomeSpy = sampleTrack.genomeSpy;

        /** @type {import("../data/dataMapper").VariantDataConfig} */
        this.dataConfig = this.layerConfig.spec;
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
    }

}