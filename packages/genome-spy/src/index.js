import { isObject, isString } from "vega-util";
import { loader as vegaLoader } from "vega-loader";

import GenomeSpy from "./genomeSpy.js";
import GenomeSpyApp from "./genomeSpyApp.js";

export { default as Interval } from "./utils/interval.js";

/**
 *
 */
export function singlePageApp() {
    const defaultConf = "config.json";

    const urlParams = new URLSearchParams(window.location.search);

    initWithConfiguration(
        urlParams.get("conf") || defaultConf,
        urlParams.get("baseUrl")
    );

    /**
     * @param {object | string} conf configuriation object or url to json configuration
     * @param {string} baseUrl
     */
    async function initWithConfiguration(conf, baseUrl) {
        try {
            if (isString(conf)) {
                // conf is a URL
                const url = conf;

                try {
                    conf = JSON.parse(await vegaLoader().load(url));
                } catch (e) {
                    throw new Error(
                        `Could not load or parse configuration: ${url}, reason: ${e.message}`
                    );
                }

                if (!conf.baseUrl) {
                    const m = url.match(/^.*\//);
                    conf.baseUrl = (m && m[0]) || "./";
                }

                if (baseUrl) {
                    if (isAbsoluteUrl(baseUrl)) {
                        conf.baseUrl = baseUrl;
                    } else {
                        conf.baseUrl = `${conf.baseUrl}/${baseUrl}`;
                    }
                }
            } else if (isObject(conf)) {
                conf.baseUrl = conf.baseUrl || "";
            } else {
                throw new Error(
                    "Invalid configuration, not a URL or json object!"
                );
            }

            return embed(document.body, conf);
        } catch (e) {
            console.log(e);

            const pre = document.createElement("pre");
            pre.innerText = e.toString();
            document.body.appendChild(pre);
        }
    }

    /**
     *
     * @param {string} url
     */
    function isAbsoluteUrl(url) {
        return /^(http|https)?:\/\//.test(url);
    }
}

/**
 *
 * @param {HTMLElement | string} el
 * @param {object} spec
 * @param {object} [opt]
 */
export async function embed(el, spec, opt = {}) {
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

    if (opt.bare) {
        const genomeSpy = new GenomeSpy(element, spec);
        return genomeSpy.launch();
    } else {
        const app = new GenomeSpyApp(element, spec);
        return app.launch();
    }
}
