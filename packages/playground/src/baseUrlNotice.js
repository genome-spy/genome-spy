import { LitElement, css, html, nothing } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { faStyles, playgroundComponentStyles } from "./componentStyles.js";

export default class BaseUrlNotice extends LitElement {
    static properties = {
        info: { attribute: false },
        expanded: { state: true },
    };

    static styles = [
        faStyles,
        playgroundComponentStyles,
        css`
            :host {
                display: block;
                font-size: var(--playground-font-small);
            }

            .bar {
                display: flex;
                align-items: center;
                gap: 8px;
                min-height: 40px;
                padding: 4px var(--playground-spacing);
                border-bottom: 1px solid var(--playground-divider);
                background: var(--playground-panel);
            }

            .summary {
                flex: 1;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .actions {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-shrink: 0;
            }

            .details {
                padding: 8px var(--playground-spacing);
                border-bottom: 1px solid var(--playground-divider);
                color: var(--playground-muted);
                background: var(--playground-panel);
            }

            .details a {
                color: var(--playground-accent-text);
                margin-left: 8px;
            }
        `,
    ];

    constructor() {
        super();
        this.info = null;
        this.expanded = false;
    }

    /**
     * @param {import("lit").PropertyValues<this>} changedProperties
     */
    updated(changedProperties) {
        if (changedProperties.has("info")) {
            this.expanded = false;
        }
    }

    render() {
        if (!this.info) {
            return nothing;
        }

        return html`
            <div class="bar">
                <span class="tag">baseUrl</span>
                <span class="summary">${this.info.summary}</span>
                <div class="actions">
                    <button
                        class="button quiet"
                        aria-expanded=${this.expanded}
                        @click=${this.#toggleExpanded}
                    >
                        ${icon(faQuestionCircle).node[0]}
                        <span>${this.expanded ? "Hide" : "What is this?"}</span>
                    </button>
                    ${
                        this.info.canClear
                            ? html`
                                  <button class="button" @click=${this.#clear}>
                                      Clear
                                  </button>
                              `
                            : nothing
                    }
                </div>
            </div>
            ${
                this.expanded
                    ? html`
                          <div class="details">
                              ${this.info.detail}
                              <a
                                  href="https://genomespy.app/docs/grammar/#properties"
                                  target="_blank"
                                  rel="noreferrer"
                                  >Docs</a
                              >
                          </div>
                      `
                    : nothing
            }
        `;
    }

    #toggleExpanded() {
        this.expanded = !this.expanded;
    }

    #clear() {
        this.dispatchEvent(
            new CustomEvent("clear", { bubbles: true, composed: true })
        );
    }
}

customElements.define("base-url-notice", BaseUrlNotice);
