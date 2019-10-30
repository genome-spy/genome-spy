
import { GenomeSpyApp } from "./index";

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
                conf = await fetch(url, { credentials: 'same-origin' })
                    .then(res => {
                        if (res.ok) {
                            return res.json();
                        }
                        throw new Error(`Could not load configuration: ${conf} \nReason: ${res.status} ${res.statusText}`);
                    });
            } catch (e) {
                throw e;
            }

            if (!conf.baseUrl) {
                const m = url.match(/^.*\//);
                conf.baseUrl = m && m[0] || "./";
            }

        } else {
            conf.baseUrl = conf.baseUrl || "";
        }

        const app = new GenomeSpyApp(conf);
        app.launch();

    } catch(e) {
        console.log(e);
        
        const pre = document.createElement("pre");
        pre.innerText = e.toString();
        document.body.appendChild(pre);
    }

}



