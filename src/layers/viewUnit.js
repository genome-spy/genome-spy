import { tsvParse } from 'd3-dsv';
import { processData } from '../data/dataMapper';
/**
 * @typedef {Object} ViewUnitConfig
 * @prop {ViewUnitConfig[]} [layer]
 * @prop {string} [mark]
 * @prop {object} [data] 
 * @prop {object[]} [transform]
 * @prop {string} [sample]
 * @prop {Object} [encoding]
 */

 /**
  * Generic data layer base class
  */
export default class ViewUnit {

    /**
     * @param {import("../tracks/sampleTrack/sampleTrack").default} sampleTrack 
     * @param {ViewUnitConfig} layerConfig 
     */
    constructor(sampleTrack, layerConfig) {
        this.layerConfig = layerConfig;

        this.sampleTrack = sampleTrack;
        this.genomeSpy = sampleTrack.genomeSpy;

        this.visualVariables = {};
    }

    async fetchAndParse(url) {
        return fetch(url)
            .then(data => data.text())
            .then(raw => processData(
                this.layerConfig, tsvParse(raw),
                this.genomeSpy.visualMapperFactory, this.visualVariables));
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