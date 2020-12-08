import { loader as vegaLoader, read } from "vega-loader";
import { getFormat } from "./dataUtils";
import FlowNode from "../flowNode";

/**
 * @param {Partial<import("../../spec/data").Data>} data
 * @returns {data is import("../../spec/data").UrlData}
 */
export function isUrlData(data) {
    return "url" in data;
}

/**
 * @template H
 * @extends {FlowNode<H>}
 */
export default class UrlSource extends FlowNode {
    /**
     * @param {import("../../spec/data").UrlData} params
     * @param {string} baseUrl
     */
    constructor(params, baseUrl) {
        super();

        this.params = params;
        this.baseUrl = baseUrl;
    }

    /**
     *
     * @param {any} datum
     */
    handle(datum) {
        throw new Error("Source does not handle incoming data!");
    }

    async load() {
        const url = this.params.url;

        /** @type {string[]} */
        const urls = Array.isArray(url) ? url : [url];

        const promises = urls.map(async url => {
            try {
                // TODO: Support chunked loading
                return /** @type {string} */ (vegaLoader({
                    baseURL: this.baseUrl
                }).load(url));
            } catch (e) {
                throw new Error(`Cannot fetch: ${url}: ${e.message}`);
            }
        });

        this.reset();

        for (const promise of promises) {
            const text = await promise;

            try {
                /** @type {any[]} */
                const data = read(text, getFormat(this.params));
                for (const d of data) {
                    this._propagate(d);
                }
            } catch (e) {
                throw new Error(`Cannot parse: ${url}: ${e.message}`);
            }
        }

        this.complete();
    }
}
