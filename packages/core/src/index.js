import { isObject, isString } from "vega-util";
import { html } from "lit";

import GenomeSpy from "./genomeSpy.js";
import icon from "./img/bowtie.svg";
import favIcon from "./img/genomespy-favicon.svg";

export { GenomeSpy, html, icon, favIcon };

/**
 * Embeds GenomeSpy into the DOM
 *
 * @type {import("./types/embedApi.js").EmbedFunction}
 * @returns {Promise<import("./types/embedApi.js").EmbedResult>}
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

        if (element == document.body) {
            // Need to add a wrapper to make sizing behavior more stable
            const wrapper = document.createElement("div");
            wrapper.style.position = "fixed";
            wrapper.style.inset = "0";
            wrapper.style.overflow = "hidden";
            element.appendChild(wrapper);
            element = wrapper;
        }

        genomeSpy = new GenomeSpy(element, specObject, options);
        applyOptions(genomeSpy, options);
        await genomeSpy.launch();
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
 * @param {import("./genomeSpy.js").default} genomeSpy
 * @param {import("./types/embedApi.js").EmbedOptions} options options
 */
function applyOptions(genomeSpy, options) {
    if (options.namedDataProvider) {
        genomeSpy.registerNamedDataProvider(options.namedDataProvider);
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
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}`);
        }
        spec = await response.json();
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
