import { normalizeUrlDescriptors } from "./urlDescriptor.js";

/**
 * Small source-side wrapper for URL descriptor normalization.
 */
export default class UrlDescriptorController {
    /** @type {import("./dataSource.js").default} */
    #source;

    /** @type {() => import("../../spec/data.js").UrlSourceRef | import("../../spec/data.js").SingleUrlSourceRef | import("../../spec/data.js").MultiUrlSourceRef | unknown} */
    #getUrl;

    /** @type {(() => import("../../spec/data.js").IndexUrlSourceRef | unknown) | undefined} */
    #getIndexUrl;

    /**
     * @param {import("./dataSource.js").default} source
     * @param {{
     *     getUrl: () => import("../../spec/data.js").UrlSourceRef | import("../../spec/data.js").SingleUrlSourceRef | import("../../spec/data.js").MultiUrlSourceRef | unknown,
     *     getIndexUrl?: () => import("../../spec/data.js").IndexUrlSourceRef | unknown,
     * }} options
     */
    constructor(source, options) {
        this.#source = source;
        this.#getUrl = options.getUrl;
        this.#getIndexUrl = options.getIndexUrl;
    }

    /**
     * @returns {Promise<import("./urlDescriptor.js").UrlDescriptor[]>}
     */
    async normalize() {
        return normalizeUrlDescriptors({
            url: this.#getUrl(),
            indexUrl: this.#getIndexUrl?.(),
            baseUrl: this.#source.view.getBaseUrl(),
            paramRuntime: this.#source.paramRuntime,
        });
    }
}
