import { tsvParse } from 'd3-dsv';

/**
 * @typedef {Object} DataConfig
 * @prop {String} [type]
 * @prop {String[] | String} [url]
 * @prop {Object[]} [values]
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
        let data;

        if (this.config.values) {
            if (!Array.isArray(this.config.values)) {
                throw new Error('"values" in data configuration is not an array!');
            }

            data = this.config.values;

        } else if (this.config.url) {
            const rawData = await this.fetchData();
            data = rawData.map(d => tsvParse(d)); // TODO: CSV, etc

        } else {
            throw new Error('No "url" or "values" defined in data configuration!');
        }


        // TODO: type inference and conversion

        return data;
    }

    async fetchData() {
        // TODO: Support "dataSource", immediate data as objects, etc...
        // TODO: Create an own module for data loading
        const dataFiles = typeof this.config.url == "string" ?
            [this.config.url] :
            this.config.url;

        const urls = dataFiles.map(u => this.addBaseUrl(u));

        return Promise.all(urls.map(url => fetch(url).then(data => data.text())));

    }

    addBaseUrl(url) {
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