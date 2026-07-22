/* global IntersectionObserver, HTMLElement, console, customElements, document, fetch, setTimeout */

import { embed as embedCore } from "@genome-spy/core";
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
 * @param {string} runtime
 * @returns {Promise<{handle: import("@genome-spy/core/types/embedApi.js").EmbedResult, styles?: string} | undefined>}
 */
async function embedToDoc(container, conf, baseUrl, runtime) {
    const examplesBaseUrl = resolveSitePath("examples/");

    try {
        conf.baseUrl =
            conf.baseUrl ||
            (baseUrl ? resolveSitePath(baseUrl) : examplesBaseUrl);

        if (runtime === "core") {
            return { handle: await embedCore(container, conf) };
        } else if (runtime === "app") {
            const { appStyles, embed } = await import("./appEmbedRuntime.js");
            installAppStyles(appStyles);
            return {
                handle: await embed(container, conf, { embedMode: "embedded" }),
                styles: appStyles,
            };
        } else {
            throw new Error(`Unknown GenomeSpy embed runtime: ${runtime}`);
        }
    } catch (e) {
        const pre = document.createElement("pre");
        pre.textContent = e.toString();
        container.appendChild(pre);
    }
}

const APP_STYLE_ID = "genome-spy-app-embed-styles";

/**
 * @param {string} styles
 */
function installAppStyles(styles) {
    if (!document.getElementById(APP_STYLE_ID)) {
        const style = document.createElement("style");
        style.id = APP_STYLE_ID;
        style.textContent = styles;
        document.head.appendChild(style);
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

            .genome-spy-app {
                box-shadow: 0px 5px 20px rgba(0, 0, 0, 0.1);
                border-radius: 3px;
                overflow: hidden;
            }
        `;
    }

    static get properties() {
        return {
            height: { type: String },
            specHidden: { type: Boolean },
            baseUrl: { type: String, attribute: "base-url" },
            playgroundUrl: { type: String, attribute: "playground-url" },
            runtime: { type: String },
        };
    }

    constructor() {
        super();
        this.height = 300;
        this.specHidden = false;
        this.baseUrl = undefined;
        this.playgroundUrl = undefined;
        this.runtime = "core";
        this.embedRef = createRef();
        this.appStyles = "";

        /** @type {import("@genome-spy/core/types/embedApi.js").EmbedResult | undefined} */
        this.embedResult = undefined;
        /** @type {IntersectionObserver | undefined} */
        this.observer = undefined;
        this.disconnected = false;
    }

    render() {
        const shouldShowLinks = this.playgroundUrl || this.specHidden;

        return html`
            ${this.appStyles
                ? html`<style>
                      ${this.appStyles}
                  </style>`
                : nothing}
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
            this.observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const container = entry.target;

                        this.embedToDoc(container, JSON.parse(spec));

                        this.observer.unobserve(container);
                    }
                });
            });

            // Slight delay to reduce layout flickering.
            setTimeout(() => {
                if (!this.disconnected) {
                    this.observer.observe(this.embedRef.value);
                }
            }, 80);
        }
    }

    /**
     * @param {HTMLElement} container
     */
    async embedToDoc(container, spec) {
        const result = await embedToDoc(
            container,
            spec,
            this.baseUrl,
            this.runtime
        );
        if (!result) {
            return;
        }

        if (this.disconnected) {
            result.handle.finalize();
        } else {
            this.embedResult = result.handle;
            if (result.styles) {
                this.appStyles = result.styles;
                this.requestUpdate();
            }
        }
    }

    disconnectedCallback() {
        this.disconnected = true;
        this.observer?.disconnect();
        this.embedResult?.finalize();
        this.embedResult = undefined;
        super.disconnectedCallback();
    }
}

customElements.define("genome-spy-doc-embed", GenomeSpyDocEmbed);
