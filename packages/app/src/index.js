import { isObject, isString } from "vega-util";

import GenomeSpy from "@genome-spy/core/genomeSpy.js";
import { loadSpec } from "@genome-spy/core/index.js";
import App from "./app.js";
import icon from "@genome-spy/core/img/bowtie.svg";
import { html } from "lit";

export { GenomeSpy, App as GenomeSpyApp, icon, html };

/**
 * Embeds GenomeSpyApp into the DOM
 *
 * This is largely copy-paste from `genome-spy/src/index.js`
 * TODO: Consolidate
 *
 * @type {import("./appTypes.js").AppEmbedFunction}
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

    /** @type {GenomeSpy} */
    let genomeSpy;

    try {
        const specObject = isObject(spec) ? spec : await loadSpec(spec);
        const agentEnabled = import.meta.env.VITE_AGENT_ENABLED === "true";
        const agentBaseUrl = agentEnabled
            ? (options.agentBaseUrl ??
              /** @type {string | undefined} */ (
                  import.meta.env.VITE_AGENT_BASE_URL
              ))
            : undefined;
        const agentModules =
            agentEnabled && agentBaseUrl
                ? await Promise.all([
                      import("./agent/agentAdapter.js"),
                      import("./agent/toolbarMenu.js"),
                  ])
                : undefined;
        const agentAdapterFactory = agentModules?.[0].createAgentAdapter;
        const toolbarMenuItemsFactory = agentModules?.[1].getAgentMenuItems;

        specObject.baseUrl ??= "";
        specObject.width ??= "container";
        specObject.padding ??= 10;

        options = {
            powerPreference: "high-performance",
            ...options,
            agentBaseUrl,
            agentAdapterFactory: agentEnabled
                ? (options.agentAdapterFactory ?? agentAdapterFactory)
                : undefined,
            toolbarMenuItemsFactory: agentEnabled
                ? (options.toolbarMenuItemsFactory ?? toolbarMenuItemsFactory)
                : undefined,
        };

        const app = new App(element, specObject, options);
        genomeSpy = app.genomeSpy;
        applyOptions(genomeSpy, options);
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
