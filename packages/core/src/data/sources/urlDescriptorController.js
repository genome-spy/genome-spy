import { isExprRef } from "../../paramRuntime/paramUtils.js";
import {
    normalizeUrlDescriptors,
    watchUrlDescriptorExpressions,
} from "./urlDescriptor.js";

/**
 * Small source-side wrapper for URL descriptor normalization and expression
 * watching. It deliberately does not know how a source uses descriptors.
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
     *     onChange: () => void,
     * }} options
     */
    constructor(source, options) {
        this.#source = source;
        this.#getUrl = options.getUrl;
        this.#getIndexUrl = options.getIndexUrl;

        const url = this.#getUrl();
        const indexUrl = this.#getIndexUrl?.();
        if (
            isWatchableDescriptorSpec(url) ||
            isWatchableDescriptorSpec(indexUrl)
        ) {
            watchUrlDescriptorExpressions({
                url,
                indexUrl,
                paramRuntime: source.paramRuntime,
                listener: options.onChange,
                registerDisposer: (disposer) =>
                    source.registerDisposer(disposer),
            });
        }
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

/**
 * Top-level ExprRefs are handled by activateExprRefProps. Descriptor
 * controllers watch nested descriptor expressions, such as template values.
 *
 * @param {unknown} value
 */
function isWatchableDescriptorSpec(value) {
    return Boolean(value && typeof value == "object" && !isExprRef(value));
}
