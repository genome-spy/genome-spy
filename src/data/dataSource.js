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
        let format = this.config.format;
        if (format && typeof format.parse == "undefined") {
            format = {
                ...format,
                parse: "auto"
            };
        }

        let data;

        if (this.config.values) {
            const values = this.config.values;

            if (Array.isArray(values)) {
                data = values;

            } else if (typeof values == "string") {
                data = read(values, format); // TODO: Require format & type

            } else {
                throw new Error('"values" in data configuration is not an array nor a string!');
            }

            data = [data];

        } else if (this.config.url) {
            const rawData = await this.fetchData();
            // TODO: Infer format from file extension
            data = rawData.map(d => read(d, format));

        } else {
            throw new Error('No "url" or "values" defined in data configuration!');
        }


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