import { LitElement, html, css, nothing } from "lit";
import { faStyles, formStyles } from "./componentStyles.js";
import { icon } from "@fortawesome/fontawesome-svg-core";

/**
 * @typedef {object} DialogFinishDetail
 * @property {boolean} ok
 * @property {string} [reason]
 * @property {unknown} [data]
 */

/**
 * Base class for GenomeSpy dialogs.
 * Subclasses override renderBody() and renderFooter().
 */
export default class BaseDialog extends LitElement {
    static properties = {
        dialogTitle: {},
        modal: { type: Boolean },
    };

    /** @type {HTMLDialogElement} */
    #dialog;

    static styles = [
        formStyles,
        faStyles,
        css`
            dialog {
                font-family: var(--gs-font-family, sans-serif);
                font-size: var(--gs-font-size, 14px);
                padding: 0;

                box-shadow: 0px 3px 15px 0px rgba(0, 0, 0, 0.21);
                background: white;
                border-radius: 3px;
                border: none;
                min-width: 300px;

                opacity: 1;
                transform: translate(0, 0);
                transition:
                    opacity 0.2s ease-in-out,
                    transform 0.2s ease-in-out;

                @starting-style {
                    opacity: 0;
                    transform: translate(0, -15px);
                }
            }

            dialog.closing {
                opacity: 0;
                transform: translate(0, -15px);
            }

            dialog::backdrop {
                background-color: rgb(75, 75, 75);
                opacity: 0.4;
                transition: opacity 0.3s ease-in-out;

                @starting-style {
                    opacity: 0;
                }
            }

            dialog.closing::backdrop {
                opacity: 0;
            }

            header,
            section,
            footer {
                padding: var(--gs-basic-spacing, 10px);
            }

            header {
                font-weight: bold;
                padding-bottom: 0;
            }

            section {
                > :first-child {
                    margin-top: 0;
                }

                > :last-child {
                    margin-bottom: 0;
                }
            }

            footer {
                border-top: 1px solid var(--gs-dialog-stroke-color, #d0d0d0);
                padding: var(--gs-basic-spacing, 10px);

                > div {
                    display: flex;
                    justify-content: flex-end;
                    gap: var(--gs-basic-spacing, 10px);
                }
            }
        `,
    ];

    constructor() {
        super();

        /** @type {string | import("lit").TemplateResult} */
        this.dialogTitle = null;

        this.modal = true;

        this.addEventListener("keydown", (/** @type {KeyboardEvent} */ e) => {
            e.stopPropagation();
        });
    }

    firstUpdated() {
        this.#dialog = this.renderRoot.querySelector("dialog");
        if (this.modal) {
            this.#dialog.showModal();
        } else {
            this.#dialog.show();
        }
    }

    /**
     * Subclasses call this to close the dialog and notify listeners.
     *
     * @param {DialogFinishDetail} detail
     * @protected
     */
    finish(detail) {
        this.dispatchEvent(
            new CustomEvent("gs-dialog-finished", {
                detail,
                bubbles: true,
                composed: true,
            })
        );
    }

    /**
     * ESC or native cancel event handler.
     *
     * @param {Event} e
     */
    #onDialogCancel(e) {
        e.preventDefault();
        this.finish({ ok: false, reason: "cancel" });
        this.triggerClose();
    }

    /**
     * @protected
     */
    triggerClose() {
        this.#dialog.addEventListener("transitionend", () => {
            this.#dialog.close();
            this.dispatchEvent(
                new CustomEvent("gs-dialog-closed", {
                    bubbles: true,
                    composed: true,
                })
            );
        });

        this.#dialog.classList.add("closing");
        this.renderRoot
            .querySelector(".non-modal-backdrop")
            ?.classList.add("closing");
    }

    /**
     * @protected
     */
    onCloseButtonClick() {
        if ("requestClose" in this.#dialog) {
            // @ts-ignore -- requestClose is not yet in the types
            this.#dialog.requestClose();
        } else {
            this.finish({ ok: false, reason: "cancel" });
            this.triggerClose();
        }
    }

    /**
     * @protected
     */
    renderHeader() {
        return html`${this.dialogTitle ? html`${this.dialogTitle}` : nothing}`;
    }

    /**
     * @protected
     */
    renderBody() {
        return html``;
    }

    /**
     * @protected
     */
    renderFooter() {
        const buttons = this.renderButtons();
        if (buttons?.length) {
            return html`<div>${buttons}</div>`;
        } else {
            return nothing;
        }
    }

    /**
     * @protected
     */
    renderButtons() {
        return [this.makeCloseButton()];
    }

    /**
     * Creates a button for the dialog footer.
     * The dialog is closed automatically unless the callback returns a truthy value.
     *
     * @param {string} title
     * @param {(() => boolean) | (() => void)} callback If returns truthy value, dialog closing is canceled
     * @param {import("@fortawesome/fontawesome-svg-core").IconDefinition} [iconDef]

     * @protected
     */
    makeButton(title, callback, iconDef) {
        return html`<button
            class="btn"
            type="button"
            title=${title}
            @click=${async () => {
                const cancelClose = !!(await callback());
                if (!cancelClose) {
                    this.triggerClose();
                }
            }}
        >
            ${iconDef ? icon(iconDef).node[0] : nothing} ${title}
        </button>`;
    }

    /**
     * @protected
     */
    makeCloseButton(label = "Close") {
        return this.makeButton(label, () => this.onCloseButtonClick());
    }

    render() {
        const header = this.renderHeader();
        const footer = this.renderFooter();

        return html`
            ${!this.modal
                ? html`<div class="non-modal-backdrop"></div>`
                : nothing}
            <dialog
                @cancel=${(/** @type {UIEvent} */ e) => this.#onDialogCancel(e)}
            >
                ${header ? html`<header>${header}</header>` : nothing}
                <section>${this.renderBody()}</section>
                ${footer ? html`<footer>${footer}</footer>` : nothing}
            </dialog>
        `;
    }
}

/**
 * Open any dialog element that extends BaseDialog
 *
 * @template {BaseDialog} T
 * @param {string} tagName - Custom element name, e.g. "gs-upload-dialog".
 * @param {(el: T) => void} [configure] - Optional function to configure props.
 * @returns {Promise<DialogFinishDetail>}
 */
export function showDialog(tagName, configure) {
    return new Promise((resolve) => {
        const el = /** @type {T} */ (document.createElement(tagName));

        if (configure) {
            configure(el);
        }

        el.addEventListener(
            "gs-dialog-finished",
            (/** @type {CustomEvent<DialogFinishDetail>} */ e) => {
                resolve(e.detail);
            },
            { once: true }
        );

        el.addEventListener("gs-dialog-closed", () => {
            el.remove();
        });

        document.body.appendChild(el);
    });
}
