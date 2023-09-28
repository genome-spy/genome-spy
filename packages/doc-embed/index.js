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
 * @param {HTMLElement} container
 * @param {object | string} conf configuration object or url to json configuration
 */
async function embedToDoc(container, conf) {
    const baseUrl = getBaseUrl();
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

export class GenomeSpyDocEmbed extends LitElement {
    static get styles() {
        return css`
            .show-spec {
                font-size: 70%;
                text-align: center;
            }

            .show-spec a {
                color: #3f51b5;
                text-decoration: none;
            }
        `;
    }

    static get properties() {
        return {
            height: { type: String },
            specHidden: { type: Boolean },
        };
    }

    constructor() {
        super();
        this.height = 300;
        this.specHidden = false;
        this.embedRef = createRef();
    }

    render() {
        return html`
            <link rel="stylesheet" href=${getBaseUrl() + "/app/style.css"} />
            <div
                class="embed-container"
                style=${styleMap({
                    height: this.height + "px",
                })}
                ${ref(this.embedRef)}
            ></div>
            ${this.specHidden
                ? html`
                      <div class="show-spec">
                          <a
                              href="#"
                              @click=${(event) => {
                                  this.specHidden = false;
                                  event.preventDefault();
                              }}
                              >Show specification</a
                          >
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

                        embedToDoc(container, JSON.parse(spec));

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
