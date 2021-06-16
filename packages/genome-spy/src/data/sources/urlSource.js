import { loader as vegaLoader, read } from "vega-loader";
import { getFormat } from "./dataUtils";
import DataSource from "./dataSource";

/**
 * @param {Partial<import("../../spec/data").Data>} data
 * @returns {data is import("../../spec/data").UrlData}
 */
export function isUrlData(data) {
    return "url" in data;
}

export default class UrlSource extends DataSource {
    /**
     * @param {import("../../spec/data").UrlData} params
     * @param {string} [baseUrl]
     */
    constructor(params, baseUrl) {
        super();

        this.params = params;
        this.baseUrl = baseUrl;
    }

    get identifier() {
        return JSON.stringify({ params: this.params, baseUrl: this.baseUrl });
    }

    async load() {
        const url = this.params.url;

        /** @type {string[]} */
        const urls = Array.isArray(url) ? url : [url];

        /** @param {string} url */
        const load = async url => {
            // TODO: Support chunked loading
            return /** @type {string} */ (vegaLoader({
                baseURL: this.baseUrl
            })
                .load(url)
                .catch(e => {
                    // TODO: Include baseurl in the error message. Should be normalized, however.
                    throw new Error(
                        `Cannot fetch: ${this.baseUrl}${url}: ${e.message}`
                    );
                }));
        };

        /**
         * @param {string} text
         * @param {string} [url]
         */
        const readAndParse = (text, url) => {
            try {
                /** @type {any[]} */
                const data = read(text, getFormat(this.params));
                this.beginBatch({ type: "file", url: url });
                for (const d of data) {
                    this._propagate(d);
                }
            } catch (e) {
                throw new Error(`Cannot parse: ${url}: ${e.message}`);
            }
        };

        this.reset();

        await Promise.all(urls.map(url => load(url).then(readAndParse)));

        this.complete();
    }
}
