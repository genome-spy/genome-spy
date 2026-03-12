import { embed } from "@genome-spy/core";
import { html, css, LitElement, nothing } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { ref, createRef } from "lit/directives/ref.js";

/**
 *
 * @param {string} url
 */
// eslint-disable-next-line no-unused-vars
async function fetchConf(url) {
    const conf = await fetch(url, { credentials: "same-origin" }).then(
        (res) => {
            if (res.ok) {
                return res.json();
            }
            throw new Error(
                `Could not load configuration: ${conf} \nReason: ${res.status} ${res.statusText}`
            );
        }
    );

    if (!conf.baseUrl) {
        const m = url.match(/^.*\//);
        conf.baseUrl = (m && m[0]) || "./";
    }

    return conf;
}

function getBaseUrl() {
    const baseUrl = document
        .querySelector("meta[name='base_url']")
        .getAttribute("content");
    if (!baseUrl) {
        console.error(`No <meta name="base_url" ...> found!`);
    }
    return baseUrl;
}

/**
 * @param {string} sitePath
 */
function resolveSitePath(sitePath) {
    if (/^(?:[a-z]+:|\/)/i.test(sitePath)) {
        return sitePath;
    }

    return getBaseUrl() + "/" + sitePath;
}

/**
 * @param {HTMLElement} container
 * @param {object | string} conf configuration object or url to json configuration
 * @param {string | undefined} baseUrl
 */
async function embedToDoc(container, conf, baseUrl) {
    const examplesBaseUrl = resolveSitePath("examples/");

    try {
        conf.baseUrl =
            conf.baseUrl ||
            (baseUrl ? resolveSitePath(baseUrl) : examplesBaseUrl);
        await embed(container, conf, { bare: true });
    } catch (e) {
        const pre = document.createElement("pre");
        pre.innerText = e.toString();
        container.appendChild(pre);
    }
}

export class GenomeSpyDocEmbed extends LitElement {
    static get styles() {
        return css`
            .embed-links {
                margin: 0.3em 0 0.6em;
                text-align: center;
                font-size: 80%;

                a {
                    color: var(--md-typeset-a-color);
                    text-decoration: none;
                }

                a:hover {
                    color: var(--md-accent-fg-color);
                }
            }
        `;
    }

    static get properties() {
        return {
            height: { type: String },
            specHidden: { type: Boolean },
            baseUrl: { type: String, attribute: "base-url" },
            playgroundUrl: { type: String, attribute: "playground-url" },
        };
    }

    constructor() {
        super();
        this.height = 300;
        this.specHidden = false;
        this.baseUrl = undefined;
        this.playgroundUrl = undefined;
        this.embedRef = createRef();
    }

    render() {
        const shouldShowLinks = this.playgroundUrl || this.specHidden;

        return html`
            <link rel="stylesheet" href=${getBaseUrl() + "/app/style.css"} />
            <div
                class="embed-container"
                style=${styleMap({
                    height: this.height + "px",
                })}
                ${ref(this.embedRef)}
            ></div>
            ${shouldShowLinks
                ? html`
                      <div class="embed-links">
                          ${this.specHidden
                              ? html`
                                    <a
                                        href="#"
                                        @click=${(event) => {
                                            this.specHidden = false;
                                            event.preventDefault();
                                        }}
                                        >Show specification</a
                                    >
                                `
                              : nothing}
                          ${this.playgroundUrl && this.specHidden
                              ? html` - `
                              : nothing}
                          ${this.playgroundUrl
                              ? html`
                                    <a href=${this.playgroundUrl}
                                        >Edit this example in Playground</a
                                    >
                                `
                              : nothing}
                      </div>
                  `
                : nothing}

            <div
                class="embed-spec"
                style=${styleMap({
                    display: this.specHidden ? "none" : "block",
                })}
            >
                <slot></slot>
            </div>
        `;
    }

    firstUpdated() {
        const spec = this.shadowRoot
            .querySelector("slot")
            .assignedNodes()
            .filter((el) => el instanceof HTMLElement)[0]?.textContent;

        if (spec) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const container = entry.target;

                        embedToDoc(container, JSON.parse(spec), this.baseUrl);

                        observer.unobserve(container);
                    }
                });
            });

            // Slight delay to reduce layout flickering.
            setTimeout(() => observer.observe(this.embedRef.value), 80);
        }
    }
}

customElements.define("genome-spy-doc-embed", GenomeSpyDocEmbed);
