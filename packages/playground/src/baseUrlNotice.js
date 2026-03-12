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
                position: relative;
                font-size: 0.82rem;
            }

            .notice {
                display: flex;
                align-items: center;
                gap: 0.65rem;
                min-height: 42px;
                padding: 6px 10px;
                box-sizing: border-box;
                background: var(
                    --playground-panel-overlay,
                    rgba(247, 245, 239, 0.95)
                );
                border-bottom: 1px solid
                    var(--playground-border, rgba(23, 32, 51, 0.1));
            }

            .content {
                flex: 1;
                min-width: 0;
            }

            .summary {
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .actions {
                display: flex;
                align-items: center;
                gap: 0.45rem;
                margin-left: auto;
                flex-shrink: 0;
            }

            .clear {
                margin-left: auto;
            }

            .help svg {
                font-size: 0.95rem;
            }

            .details {
                position: absolute;
                top: calc(100% + 6px);
                left: 10px;
                max-width: min(34rem, calc(100vw - 20px));
                padding: 0.65rem 0.8rem;
                border: 1px solid
                    var(--playground-border-strong, rgba(23, 32, 51, 0.14));
                border-radius: 0.65rem;
                background: var(
                    --playground-surface-raised,
                    rgba(255, 255, 255, 0.98)
                );
                box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
                color: var(--playground-muted-strong, #5a6678);
                font-size: 0.78rem;
                line-height: 1.35;
                z-index: 2;
            }

            .details a {
                color: var(--playground-accent-text, #335679);
                margin-left: 0.45rem;
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
            <div class="notice">
                <span class="pill-tag">baseUrl</span>
                <div class="content">
                    <span class="summary">${this.info.summary}</span>
                </div>
                <div class="actions">
                    <button
                        class="link-button help"
                        @click=${this.#toggleExpanded}
                    >
                        ${icon(faQuestionCircle).node[0]}
                        <span>${this.expanded ? "Hide" : "What is this?"}</span>
                    </button>
                    ${this.info.canClear
                        ? html`
                              <button
                                  class="chip-button clear"
                                  @click=${this.#clear}
                              >
                                  Clear
                              </button>
                          `
                        : nothing}
                </div>
            </div>
            ${this.expanded
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
                : nothing}
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
