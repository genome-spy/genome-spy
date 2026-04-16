import { isObject, isString } from "vega-util";

import GenomeSpy from "@genome-spy/core/genomeSpy.js";
import { loadSpec } from "@genome-spy/core/index.js";
import App from "./app.js";
import icon from "@genome-spy/core/img/bowtie.svg";
import { html } from "lit";
import { setupAgentRuntime } from "./agent/agentEmbedRuntime.js";

export { GenomeSpy, App as GenomeSpyApp, icon, html };

/**
 * Embeds GenomeSpy App into the DOM.
 *
 * This is largely copy-paste from `genome-spy/src/index.js`
 * TODO: Consolidate
 *
 * @type {import("./embedTypes.js").AppEmbedFunction}
 */
export async function embed(el, spec, options = {}) {
    /** @type {HTMLElement} */
    let element;

    if (isString(el)) {
        element = document.querySelector(el);
        if (!element) {
            throw new Error(`No such element: ${el}`);
        }
    } else if (el instanceof HTMLElement) {
        element = el;
    } else {
        throw new Error(`Invalid element: ${el}`);
    }

    /** @type {import("@genome-spy/core/genomeSpy.js").default} */
    let genomeSpy;

    try {
        const specObject = isObject(spec) ? spec : await loadSpec(spec);

        specObject.baseUrl ??= "";
        specObject.width ??= "container";
        specObject.padding ??= 10;

        const embedOptions =
            /** @type {import("./embedTypes.js").AppEmbedOptions} */ ({
                powerPreference: "high-performance",
                ...options,
            });

        const app = new App(element, specObject, embedOptions);
        genomeSpy = app.genomeSpy;
        await setupAgentRuntime(app, options);
        applyOptions(genomeSpy, embedOptions);
        await app.launch();
    } catch (e) {
        element.innerText = e.toString();
        console.error(e);
    }

    return {
        finalize() {
            genomeSpy.destroy();
            while (element.firstChild) {
                element.firstChild.remove();
            }
        },

        addEventListener(type, listener) {
            genomeSpy.addEventListener(type, listener);
        },

        removeEventListener(type, listener) {
            genomeSpy.removeEventListener(type, listener);
        },

        getScaleResolutionByName(name) {
            return genomeSpy.getNamedScaleResolutions().get(name);
        },

        awaitVisibleLazyData: genomeSpy.awaitVisibleLazyData.bind(genomeSpy),
        getRenderedBounds: genomeSpy.getRenderedBounds.bind(genomeSpy),
        updateNamedData: genomeSpy.updateNamedData.bind(genomeSpy),
        getLogicalCanvasSize: genomeSpy.getLogicalCanvasSize.bind(genomeSpy),
        exportCanvas: genomeSpy.exportCanvas.bind(genomeSpy),
    };
}

/**
 *
 * @param {import("@genome-spy/core/genomeSpy.js").default} genomeSpy
 * @param {Record<string, any>} opt
 */
function applyOptions(genomeSpy, opt) {
    if (opt.namedDataProvider) {
        genomeSpy.registerNamedDataProvider(opt.namedDataProvider);
    }
}
