import { isObject, isString } from "vega-util";
import { loader as vegaLoader } from "vega-loader";

import GenomeSpy from "@genome-spy/core/genomeSpy.js";
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
 * @type {import("@genome-spy/core/embedApi").EmbedFunction}
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

        specObject.baseUrl ??= "";
        specObject.width ??= "container";
        specObject.padding ??= 10;

        const app = new App(element, specObject, options);
        genomeSpy = app.genomeSpy;
        applyOptions(genomeSpy, options);
        await app.launch();
    } catch (e) {
        // eslint-disable-next-line require-atomic-updates
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
            const listenersByType = genomeSpy._eventListeners;

            let listeners = listenersByType.get(type);
            if (!listeners) {
                listeners = new Set();
                listenersByType.set(type, listeners);
            }

            listeners.add(listener);
        },

        removeEventListener(type, listener) {
            const listenersByType = genomeSpy._eventListeners;

            listenersByType.get(type)?.delete(listener);
        },

        getScaleResolutionByName(name) {
            return genomeSpy.getNamedScaleResolutions().get(name);
        },

        updateNamedData: genomeSpy.updateNamedData.bind(genomeSpy),
    };
}

/**
 *
 * @param {import("@genome-spy/core/genomeSpy").default} genomeSpy
 * @param {Record<string, any>} opt
 */
function applyOptions(genomeSpy, opt) {
    if (opt.namedDataProvider) {
        genomeSpy.registerNamedDataProvider(opt.namedDataProvider);
    }
}

/**
 * Loads the spec from the given url and sets the baseUrl if it is not
 * defined in the spec.
 *
 * @param {string} url
 */
export async function loadSpec(url) {
    let spec;

    try {
        spec = JSON.parse(await vegaLoader().load(url));
    } catch (e) {
        throw new Error(
            `Could not load or parse configuration: ${url}, reason: ${e.message}`
        );
    }

    if (!spec.baseUrl) {
        const m = url.match(/^[^?#]*\//);
        spec.baseUrl = (m && m[0]) || "./";
    }

    return spec;
}
