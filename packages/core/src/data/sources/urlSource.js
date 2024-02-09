import { loader as vegaLoader, read } from "vega-loader";
import { getFormat } from "./dataUtils.js";
import DataSource from "./dataSource.js";
import {
    activateExprRefProps,
    withoutExprRef,
} from "../../view/paramMediator.js";

/**
 * @param {Partial<import("../../spec/data.js").Data>} data
 * @returns {data is import("../../spec/data.js").UrlData}
 */
export function isUrlData(data) {
    return "url" in data;
}

export default class UrlSource extends DataSource {
    /**
     * @param {import("../../spec/data.js").UrlData} params
     * @param {import("../../view/view.js").default} view
     */
    constructor(params, view) {
        super(view);

        this.params = activateExprRefProps(view.paramMediator, params, () =>
            this.load()
        );

        this.baseUrl = view?.getBaseUrl();
    }

    get identifier() {
        return JSON.stringify({ params: this.params, baseUrl: this.baseUrl });
    }

    async load() {
        const url = withoutExprRef(this.params.url);

        /** @type {string[]} */
        const urls = Array.isArray(url) ? url : [url];

        if (urls.length === 0 || !urls[0]) {
            this.reset();
            this.complete();
            return;
        }

        /** @param {string} url */
        const load = async (url) =>
            // TODO: Support chunked loading
            /** @type {string} */ (
                vegaLoader({
                    baseURL: this.baseUrl,
                })
                    .load(url)
                    .catch((/** @type {Error} */ e) => {
                        // TODO: Include baseurl in the error message. Should be normalized, however.
                        throw new Error(`${url}: ${e.message}`);
                    })
            );

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

        this.setLoadingStatus("loading");
        this.reset();

        try {
            await Promise.all(urls.map((url) => load(url).then(readAndParse)));
            this.setLoadingStatus("complete");
        } catch (e) {
            this.setLoadingStatus("error", e.message);
        }

        this.complete();
    }
}
