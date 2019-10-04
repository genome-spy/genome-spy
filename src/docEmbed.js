
import GenomeSpy from "./genomeSpy";
import GenomeSpyApp from "./genomeSpyApp.js";

/**
 * 
 * @param {string} url 
 */
async function fetchConf(url) {
    const conf = await fetch(url, { credentials: 'same-origin' })
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
        conf.baseurl = conf.baseurl || "./";

        console.log(conf);
        const app = new GenomeSpy(container, conf);
        await app.launch();

    } catch (e) {
        const pre = document.createElement("pre");
        pre.innerText = e.toString();
        container.appendChild(pre);
    }
}

async function initialize(exampleElement) {
    const htmlElement = /** @type {HTMLElement} */(exampleElement);
    const url = htmlElement.dataset.url;

    if (url) {
        let container = /** @type {HTMLElement} */(htmlElement.querySelector(".embed-container"));
        if (!container) {
            container = document.createElement("div");
            container.className = "embed-container";
            htmlElement.appendChild(container);
        }

        const conf = await fetchConf(url);
        embed(container, conf)

    } else {
        const spec = /** @type {HTMLElement} */(htmlElement.querySelector(".embed-spec"));
        const container = /** @type {HTMLElement} */(htmlElement.querySelector(".embed-container"));

        if (spec && container) {
            embed(container, JSON.parse(spec.textContent));
        }
    }
}
    
document.addEventListener("DOMContentLoaded", () => {

    const examples = document.querySelectorAll(".embed-example");

    let observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const example = entry.target;
                initialize(example);
                observer.unobserve(example);
            }
        });
    });

    examples.forEach(example => observer.observe(example));

});