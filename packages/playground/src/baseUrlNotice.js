import { LitElement, css, html, nothing } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { dom } from "@fortawesome/fontawesome-svg-core";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { unsafeCSS } from "lit";

export default class BaseUrlNotice extends LitElement {
    static properties = {
        info: { attribute: false },
        expanded: { state: true },
    };

    static styles = css`
        ${unsafeCSS(dom.css())}

        :host {
            display: block;
            position: relative;
            color: #364154;
            font-family: sans-serif;
            font-size: 0.82rem;
        }

        .notice {
            display: flex;
            align-items: center;
            gap: 0.65rem;
            min-height: 42px;
            padding: 6px 10px;
            box-sizing: border-box;
            background: rgba(247, 245, 239, 0.95);
            border-bottom: 1px solid rgba(23, 32, 51, 0.1);
        }

        .label {
            flex-shrink: 0;
            padding: 0.15rem 0.45rem;
            border-radius: 999px;
            background: rgba(84, 143, 204, 0.12);
            color: #335679;
            font-weight: 600;
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

        .help,
        .clear {
            display: inline-flex;
            align-items: center;
            gap: 0.3rem;
            padding: 0;
            border: none;
            background: none;
            color: #335679;
            font: inherit;
            cursor: pointer;
        }

        .clear {
            padding: 0.2rem 0.55rem;
            border: 1px solid rgba(23, 32, 51, 0.14);
            border-radius: 999px;
            background: white;
            color: #364154;
        }

        .clear:hover {
            background: #f4f7fb;
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
            border: 1px solid rgba(23, 32, 51, 0.14);
            border-radius: 0.65rem;
            background: rgba(255, 255, 255, 0.98);
            box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
            color: #5a6678;
            font-size: 0.78rem;
            line-height: 1.35;
            z-index: 2;
        }

        .details a {
            color: #335679;
            margin-left: 0.45rem;
        }
    `;

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
                <span class="label">baseUrl</span>
                <div class="content">
                    <span class="summary">${this.info.summary}</span>
                </div>
                <div class="actions">
                    <button class="help" @click=${this.#toggleExpanded}>
                        ${icon(faQuestionCircle).node[0]}
                        <span>${this.expanded ? "Hide" : "What is this?"}</span>
                    </button>
                    ${this.info.canClear
                        ? html`
                              <button class="clear" @click=${this.#clear}>
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
