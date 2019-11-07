import { read } from 'vega-loader';
import { range as d3range } from 'd3-array';
import { DataGroup, GroupGroup, Group } from './group';

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
     * @returns {Promise<object[]>}
     */
    async getUngroupedData() {
        return this.getData().then(g => g.ungroupAll().data);
    }

    /**
     * @returns {Promise<Group>}
     */
    async getData() {
        if (this.config.values) {
            return this._getImmediateData();

        } else if (this.config.sequence) {
            return this._getSequence();
            
        } else if (this.config.url) {
            return await this._fetchAndReadAll();

        } else if (this.config.name) {
            const data = this.namedDataProvider(this.config.name);
            if (data) {
                return new DataGroup(this.config.name, data);
            } else {
                throw new Error("No such named dataset: " + this.config.name);
            }

        } else {
            throw new Error('No "url", "values", "sequence", or "name" defined in data configuration!');
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
            if (values.length > 0) {
                if (typeof values[0] == "object") {
                    // It's an array of objects
                    // TODO: Should check the whole array and abort if types are heterogeneous
                    data = values;

                } else {
                    // Wrap scalars to objects
                    data = values.map(d => ({ data: d }));
                }
            } else {
                data = [];
            }

        } else if (typeof values == "string") {
            // It's a string that needs to be parsed
            data = read(values, this._getFormat());

        } else {
            throw new Error('"values" in data configuration is not an array nor a string!');
        }

        return new DataGroup("immediate", data);
    }

    _getSequence() {
        const conf = this.config.sequence;
        if (typeof conf.start !== "number" || typeof conf.stop !== "number") {
            throw new Error("Missing or invalid start or stop in sequence generator config: " + JSON.stringify(conf));
        }

        const data = d3range(conf.start, conf.stop, conf.step || 1)
            .map(x => ({
                [conf.as || "data"]: x
            }));
        
            return new DataGroup("sequence", data);
    }

    /**
     * 
     * @param {string} url May be relative
     * @returns {Promise<DataGroup>}
     */
    async _fetchAndRead(url) {
        return fetch(this._addBaseUrl(url), { credentials: 'same-origin' }).then(response => {
            if (!response.ok) {
                throw new Error(`Cannot load ${response.url}: ${response.status} ${response.statusText}`);
            }
            return response.text();
        }).then(text => new DataGroup(
            url,
            read(text, this._getFormat(this._extractTypeFromUrl(url)))
        )).catch(reason => {
            console.error(reason);
            throw new Error(`Cannot fetch data file: ${url}`);
        });
    }

    /**
     * @returns {Promise<Group>}
     */
    async _fetchAndReadAll() {
        const url = this.config.url;

        // TODO: Improve performance by feeding data to the transformation pipeline as soon as it has been loaded.
        // ... wait for all only when the complete data is needed.

        if (typeof url == "string") {
            return this._fetchAndRead(url);

        } else if (Array.isArray(url)) {
            return new GroupGroup("root",
                await Promise.all(/** @type {string[]} */(url).map(url => this._fetchAndRead(url))));

        } else {
            throw new Error("url is neither a string nor an array: " + JSON.stringify(url));
        }
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