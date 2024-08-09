import { read } from "vega-loader";
import { getFormat, responseType } from "./dataUtils.js";
import DataSource from "./dataSource.js";
import {
    activateExprRefProps,
    withoutExprRef,
} from "../../view/paramMediator.js";
import { concatUrl } from "../../utils/url.js";

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

    get label() {
        return "urlSource";
    }

    async load() {
        const url = withoutExprRef(this.params.url);

        /** @type {string[]} */
        const urls = Array.isArray(url) ? url : [url];

        const format = getFormat(this.params);
        const type = responseType(format.type);

        if (urls.length === 0 || !urls[0]) {
            this.reset();
            this.complete();
            return;
        }

        /** @param {string} url */
        const load = async (url) => {
            try {
                const fullUrl = concatUrl(this.baseUrl, url);
                const result = await fetch(fullUrl);
                if (!result.ok) {
                    throw new Error(`${result.status} ${result.statusText}`);
                }
                // @ts-ignore
                return typeof result[type] == "function"
                    ? // @ts-ignore
                      result[type]()
                    : result.text();
            } catch (e) {
                throw new Error(
                    `Could not load data: ${url}. Reason: ${e.message}`
                );
            }
        };

        /**
         * @param {any} content
         * @param {string} [url]
         */
        const readAndParse = (content, url) => {
            try {
                /** @type {any[]} */
                const data = read(content, format);
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
