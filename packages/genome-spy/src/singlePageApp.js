import { GenomeSpyApp } from "./index";
import { loader as vegaLoader } from "vega-loader";

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
        if (typeof conf == "string") {
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
        } else if (typeof conf === "object") {
            conf.baseUrl = conf.baseUrl || "";
        } else {
            throw new Error("Invalid configuration, not a URL or json object!");
        }

        const app = new GenomeSpyApp(conf);
        app.launch();
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
