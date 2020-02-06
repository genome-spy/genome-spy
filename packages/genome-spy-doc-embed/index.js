import { embed } from "genome-spy";

/**
 *
 * @param {string} url
 */
async function fetchConf(url) {
    const conf = await fetch(url, { credentials: "same-origin" }).then(res => {
        if (res.ok) {
            return res.json();
        }
        throw new Error(
            `Could not load configuration: ${conf} \nReason: ${res.status} ${res.statusText}`
        );
    });

    if (!conf.baseUrl) {
        const m = url.match(/^.*\//);
        conf.baseUrl = (m && m[0]) || "./";
    }

    return conf;
}

/**
 * @param {HTMLElement} container
 * @param {object | string} conf configuriation object or url to json configuration
 */
async function embedToDoc(container, conf) {
    const baseUrl = document
        .querySelector("meta[name='base_url']")
        .getAttribute("content");
    if (!baseUrl) {
        console.error(`No <meta name="base_url" ...> found!`);
        return;
    }

    const dataBaseUrl = `${baseUrl}/data/`;

    try {
        conf.baseUrl = conf.baseUrl || dataBaseUrl;
        await embed(container, conf, { bare: true });
    } catch (e) {
        const pre = document.createElement("pre");
        pre.innerText = e.toString();
        container.appendChild(pre);
    }
}

async function initialize(exampleElement) {
    const htmlElement = /** @type {HTMLElement} */ (exampleElement);
    const container = /** @type {HTMLElement} */ (htmlElement.querySelector(
        ".embed-container"
    ));
    const url = htmlElement.dataset.url;

    try {
        if (url) {
            let container = /** @type {HTMLElement} */ (htmlElement.querySelector(
                ".embed-container"
            ));
            if (!container) {
                container = document.createElement("div");
                container.className = "embed-container";
                htmlElement.appendChild(container);
            }

            const conf = await fetchConf(url);
            embedToDoc(container, conf);
        } else {
            const spec = /** @type {HTMLElement} */ (htmlElement.querySelector(
                ".embed-spec"
            ));

            if (spec && container) {
                embedToDoc(container, JSON.parse(spec.textContent));
            }
        }
    } catch (e) {
        console.error(e);
        container.innerText = e.message;
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

    examples.forEach(example => {
        if (example.classList.contains("hidden-spec")) {
            const showSpec = example.querySelector(".show-spec a");
            if (showSpec) {
                showSpec.addEventListener("click", e => {
                    example.classList.remove("hidden-spec");
                    e.preventDefault();
                });
            }
        }

        observer.observe(example);
    });
});
