import { loader as vegaLoader, read } from "vega-loader";
import { range as d3range } from "d3-array";

/**
 * @typedef {Object} FormatConfig
 * @prop {String} type
 * @prop {Object} [parse]
 */

/**
 * @typedef {Object} SequenceConfig
 * @prop {number} start
 * @prop {number} stop
 * @prop {number} [step]
 * @prop {string} [as]
 */

/**
 * @typedef {import("../spec/data").Data} DataConfig
 */

export default class DataSource {
    /**
     *
     * @param {DataConfig} config
     * @param {String} baseUrl
     * @param {function(string):object[]} [namedDataProvider] Named datasets
     */
    constructor(config, baseUrl, namedDataProvider) {
        this.config = config;
        this.baseUrl = baseUrl;
        this.namedDataProvider = namedDataProvider;
    }

    /**
     * @returns {Promise<Group>}
     */
    // eslint-disable-next-line require-await
    async getData() {
        if (this.config.values) {
            return this._getImmediateData();
        } else if (this.config.sequence) {
            return this._getSequence();
        } else if (this.config.url) {
            return this._fetchAndReadAll();
        } else if (this.config.dynamicSource) {
            return this._getDynamicData();
        } else if (this.config.name) {
            const data = this.namedDataProvider(this.config.name);
            if (data) {
                return new DataGroup(this.config.name, data);
            } else {
                throw new Error("No such named dataset: " + this.config.name);
            }
        } else {
            throw new Error(
                'No "url", "values", "sequence", "name", or "dynamicSource" defined in data configuration!'
            );
        }
    }

    async _getDynamicData() {
        return new DataGroup(
            "data",
            await /** @type {import("../spec/data").DynamicData} */ (this.config).dynamicSource()
        );
    }
}
