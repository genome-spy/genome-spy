import { isObject, isString } from "vega-util";
import { loader as vegaLoader } from "vega-loader";
import { html } from "lit-html";

import GenomeSpy from "./genomeSpy.js";
import icon from "./img/bowtie.svg";

export { GenomeSpy, html, icon };

/**
 * Embeds GenomeSpy into the DOM
 *
 * @param {HTMLElement | string} el HTMLElement or a query selector
 * @param {object | string} spec a spec object or an url to a json spec
 * @param {import("./options.js").EmbedOptions} [options] options
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
        const specObject = /** @type {import("./spec/root").RootSpec} */ (
            isObject(spec) ? spec : await loadSpec(spec)
        );

        specObject.baseUrl = specObject.baseUrl || "";

        if (!("width" in specObject)) {
            specObject.width = "container";
        }

        if (!("padding" in specObject)) {
            specObject.padding = 10;
        }

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

        /**
         * @param {string} type
         * @param {(event: any) => void} listener
         */
        addEventListener(type, listener) {
            const listenersByType = genomeSpy._eventListeners;

            let listeners = listenersByType.get(type);
            if (!listeners) {
                listeners = new Set();
                listenersByType.set(type, listeners);
            }

            listeners.add(listener);
        },

        /**
         * @param {string} type
         * @param {(event: any) => void} listener
         */
        removeEventListener(type, listener) {
            const listenersByType = genomeSpy._eventListeners;

            listenersByType.get(type)?.delete(listener);
        },

        /**
         * @param {string} name
         * @returns {import("./view/scaleResolutionApi").ScaleResolutionApi}
         */
        getScaleResolutionByName(name) {
            return genomeSpy.getNamedScaleResolutions().get(name);
        },
    };
}

/**
 *
 * @param {import("./genomeSpy").default} genomeSpy
 * @param {import("./options.js").EmbedOptions} options options
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
