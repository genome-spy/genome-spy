import { GenomeSpyApp } from "./index";
import { loader as vegaLoader } from "vega-loader";

const defaultConf = "config.json";

const urlParams = new URLSearchParams(window.location.search);

initWithConfiguration(urlParams.get("conf") || defaultConf);

/**
 * @param {object | string} conf configuriation object or url to json configuration
 */
async function initWithConfiguration(conf) {
    try {
        if (typeof conf == "string") {
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
