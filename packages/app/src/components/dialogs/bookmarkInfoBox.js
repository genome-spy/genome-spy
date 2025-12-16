import { css, html } from "lit";
import BaseDialog from "../generic/baseDialog.js";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faBookmark,
    faChevronDown,
    faStepBackward,
    faStepForward,
} from "@fortawesome/free-solid-svg-icons";
import safeMarkdown from "../../utils/safeMarkdown.js";

const infoBoxStyles = css`
    dialog {
        position: fixed;
        bottom: var(--gs-basic-spacing);
        margin-right: var(--gs-basic-spacing);
        max-width: 600px;
    }

    .markdown {
        img {
            max-width: 350px;
            display: block;
            margin: 1em auto;
        }

        p:first-child {
            margin-top: 0;
        }

        p:last-child {
            margin-bottom: 0;
        }
    }

    .collapse {
        all: unset;
        position: absolute;
        right: var(--gs-basic-spacing);
        top: var(--gs-basic-spacing);
        background: none;
        border: none;
        font-size: 1.1em;

        border-radius: 2px;
        padding: 0 0.2em;
        cursor: pointer;

        &:focus {
            outline: revert;
        }

        svg {
            transition: transform 0.5s;
        }

        &:hover {
            background-color: #e8e8e8;
        }
    }

    dialog:not(.collapsed) .content:not(:hover) .collapse {
        animation: move 0.25s 0.5s 3 linear;

        @keyframes move {
            0% {
                transform: translateY(0);
            }
            25% {
                transform: translateY(-2px);
            }
            75% {
                transform: translateY(2px);
            }
            100% {
                transform: translateY(0);
            }
        }
    }

    dialog.collapsed {
        section,
        footer {
            display: none;
        }

        header {
            padding-bottom: var(--gs-basic-spacing);
            padding-right: 3em;
        }

        .collapse {
            svg {
                transform: rotate(180deg);
            }
        }
    }

    .non-modal-backdrop {
        pointer-events: none;

        position: fixed;
        inset: 0;

        opacity: 1;
        transition: opacity 0.2s ease-in-out;

        @starting-style {
            opacity: 0;
        }

        background: linear-gradient(
            160deg,
            transparent 70%,
            rgba(0, 0, 0, 0.2)
        );

        &.closing {
            opacity: 0;
        }
    }
`;

export default class BookmarkInfoBox extends BaseDialog {
    static properties = {
        ...super.properties,
        entry: {},
        mode: { type: String },
        allowImport: { type: Boolean },
        baseUrl: { type: String },
        entryIndex: { state: true },
    };

    static styles = [...super.styles, infoBoxStyles];

    constructor() {
        super();
        /** @type {import("../../bookmark/databaseSchema.js").BookmarkEntry} */
        this.entry = null;
        this.mode = "default";
        this.allowImport = false;

        /**
         * For markdown base URL resolution
         */
        this.baseUrl = "";

        this.modal = false;

        /** @type {string[]} */
        this.names = [];
        /** @type {number} */
        this.entryIndex = -1;
    }

    /**
     * @param {Map<string, any>} changed
     */
    willUpdate(changed) {
        super.willUpdate(changed);

        const nNames = this.names?.length ?? 0;

        if (nNames) {
            this.entryIndex = this.names.indexOf(this.entry?.name);
        }

        const of =
            this.mode == "tour" && nNames
                ? ` ${this.entryIndex + 1} of ${this.names.length}`
                : "";

        this.dialogTitle = `${this.mode == "shared" ? "Shared bookmark" : "Bookmark"}${of}: ${this.entry.name ?? "Unnamed"}`;
    }

    /** @param {number} index */
    async #jumpTo(index) {
        if (index < 0 || index >= this.names.length) {
            return;
        }

        this.dispatchEvent(
            new CustomEvent("gs-jump-to-bookmark", {
                bubbles: true,
                composed: true,
                detail: { name: this.names[index] },
            })
        );
    }

    renderHeader() {
        return html`${this.dialogTitle}
            <button
                title="Collapse"
                class="btn collapse"
                @click=${(/** @type {MouseEvent} */ e) =>
                    /** @type {HTMLElement} */ (e.target)
                        .closest("dialog")
                        .classList.toggle("collapsed")}
            >
                ${icon(faChevronDown).node[0]}
            </button> `;
    }

    renderBody() {
        /** @type {any} */
        const entry = this.entry;
        const content = entry.notes
            ? safeMarkdown(entry.notes, {
                  baseUrl: this.baseUrl,
              })
            : html`<span class="no-notes">No notes provided</span>`;

        return html`<div class="notes">${content}</div>`;
    }

    renderButtons() {
        return [
            this.mode == "shared" && this.allowImport
                ? this.makeButton(
                      "Import bookmark",
                      () => {
                          this.dispatchEvent(
                              new CustomEvent("gs-import-bookmark", {
                                  bubbles: true,
                                  composed: true,
                                  detail: { entry: this.entry },
                              })
                          );
                          return true;
                      },
                      faBookmark
                  )
                : html``,
            this.makeCloseButton(this.mode == "tour" ? "End tour" : "Close"),
            this.names.length && this.mode == "tour"
                ? html`<button
                      class="btn"
                      @click=${async () => {
                          await this.#jumpTo(this.entryIndex - 1);
                      }}
                      ?disabled=${this.entryIndex <= 0}
                  >
                      ${icon(faStepBackward).node[0]} Previous
                  </button>`
                : html``,
            this.names.length && this.mode == "tour"
                ? html`<button
                      class="btn"
                      @click=${async () => {
                          await this.#jumpTo(this.entryIndex + 1);
                      }}
                      autofocus
                      ?disabled=${this.entryIndex >= this.names.length - 1}
                  >
                      Next ${icon(faStepForward).node[0]}
                  </button>`
                : html``,
        ];
    }
}

customElements.define("gs-bookmark-info-box", BookmarkInfoBox);
