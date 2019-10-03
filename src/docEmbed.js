
import GenomeSpy from "./genomeSpy";
import GenomeSpyApp from "./genomeSpyApp.js";

/**
 * 
 * @param {string} url 
 */
async function fetchConf(url) {
    const conf = await fetch(url, { credentials: 'include' })
        .then(res => {
            if (res.ok) {
                return res.json();
            }
            throw new Error(`Could not load configuration: ${conf} \nReason: ${res.status} ${res.statusText}`);
        });

    if (!conf.baseurl) {
        const m = url.match(/^.*\//);
        conf.baseurl = m && m[0] || "./";
    }

    return conf;
}

/**
 * @param {HTMLElement} container
 * @param {object | string} conf configuriation object or url to json configuration
 */
async function embed(container, conf) {

    try {
        conf.baseurl = conf.baseurl || "";

        const app = new GenomeSpy(container, conf);
        await app.launch();

    } catch (e) {
        console.log(e);
        
        const pre = document.createElement("pre");
        pre.innerText = e.toString();
        container.appendChild(pre);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".embed-example").forEach(async elem => {
        const htmlElement = /** @type {HTMLElement} */(elem);
        const url = htmlElement.dataset.url;
        const conf = await fetchConf(url);

        embed(htmlElement, conf)
    })
});