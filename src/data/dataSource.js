import { read } from 'datalib';

/**
 * @typedef {Object} FormatConfig
 * @prop {String} type
 * @prop {Object} [parse]
 */
/**
 * @typedef {Object} DataConfig
 * @prop {FormatConfig} [format]
 * @prop {String[] | String} [url]
 * @prop {Object[]} [values]
 * 
 */

 /**
  * 
  */
export default class DataSource {
    /**
     * 
     * @param {DataConfig} config 
     * @param {String} baseUrl
     */
    constructor(config, baseUrl) {
        this.config = config;
        this.baseUrl = baseUrl;
    }

    async getConcatedData() {
        const datasets = await this.getDatasets();
        return datasets.flat();
    }

    /**
     * @returns {Promise<any[][]>}
     */
    async getDatasets() {
        if (this.config.values) {
            return this._getImmediateData();

        } else if (this.config.url) {
            return await this._fetchAndReadAll();

        } else {
            throw new Error('No "url" or "values" defined in data configuration!');
        }
    }

    _getFormat(type) {
        const format = { ...this.config.format };

        format.type = format.type || type;
        format.parse = format.parse || "auto";

        if (!format.type) {
            throw new Error("Format for data source was not defined and it could not be inferred: " + JSON.stringify(this.config));
        }

        return format;
    }

    _extractTypeFromUrl(url) {
        const match = url.match(/\.(csv|tsv|json)/)
        return match ? match[1] : null;
    }

    _getImmediateData() {
        let data;
        const values = this.config.values;

        if (Array.isArray(values)) {
            // It's an array of objects
            data = values;

        } else if (typeof values == "string") {
            // It's a string that needs to be parsed
            data = read(values, this._getFormat());

        } else {
            throw new Error('"values" in data configuration is not an array nor a string!');
        }

        return [data];
    }

    /**
     * 
     * @param {string} url May be relative
     */
    async _fetchAndRead(url) {
        return fetch(this._addBaseUrl(url)).then(response => {
            if (!response.ok) {
                throw new Error(`Can not load ${response.url}: ${response.status} ${response.statusText}`);
            }
            return response.text();
        }).then(text => read(text, this._getFormat(this._extractTypeFromUrl(url))));
    }

    async _fetchAndReadAll() {
        const url = this.config.url;

        const dataFiles = typeof url == "string" ?
            [this.config.url] :
            this.config.url;

        // TODO: Improve performance by feeding data to the transformation pipeline as soon as it has been loaded.
        // ... wait for all only when the complete data is needed.
        return Promise.all(dataFiles.map(url => this._fetchAndRead(url)));
    }

    _addBaseUrl(url) {
        if (/^http(s):\/\//.test(url)) {
            return url;

        } else {
            if (!this.baseUrl) {
                throw new Error("No baseUrl defined!");
            }

            return this.baseUrl + url;
        }
    }
    
}