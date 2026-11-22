import { LitElement, html, css, nothing } from "lit";
import { faStyles, renderIcon } from "./icon.js";
import { formStyles } from "./formStyles.js";

const DEFAULT_ACTION_INPUT_TYPES = new Set([
    "text",
    "search",
    "email",
    "url",
    "password",
    "tel",
    "number",
    "date",
    "time",
    "datetime-local",
    "month",
    "week",
]);

/**
 * @typedef {object} DialogFinishDetail
 * @property {boolean} ok
 * @property {string} [reason]
 * @property {unknown} [data]
 */

/**
 * Base class for native dialogs. Subclasses supply content and actions through
 * renderBody() and renderButtons(), and can also override the header and footer.
 *
 * @fires {CustomEvent<DialogFinishDetail>} gs-dialog-finished - Reports the outcome in event.detail.
 * @fires {CustomEvent} gs-dialog-closed - Fires after the native dialog closes.
 * @csspart dialog - Native dialog frame.
 * @csspart header - Title area.
 * @csspart body - Content area.
 * @csspart footer - Action area.
 * @csspart button - Action created by makeButton().
 * @csspart primary-button - Primary action created by makeButton().
 * @cssprop --gs-dialog-background - Dialog surface.
 * @cssprop --gs-dialog-text - Dialog text color.
 * @cssprop --gs-dialog-backdrop - Modal backdrop color.
 * @cssprop --gs-dialog-radius - Dialog corner radius.
 * @cssprop --gs-dialog-stroke-color - Footer separator color.
 * @cssprop --gs-theme-primary - Primary action fill color.
 * @cssprop --gs-theme-on-primary - Primary action text color.
 * @cssprop --gs-primary-button-background - Custom primary action fill or gradient.
 * @cssprop --gs-primary-button-hover-background - Custom hovered primary action fill or gradient.
 */
export default class BaseDialog extends LitElement {
    static properties = {
        dialogTitle: {},
        dialogDescribedBy: { type: String, attribute: "dialog-described-by" },
        modal: { type: Boolean },
    };

    /** @type {HTMLDialogElement} */
    #dialog;

    /** Open when first rendered. Set to false for a dialog opened on demand. */
    openOnConnect = true;

    static styles = [
        formStyles,
        faStyles,
        css`
            dialog {
                font-family: var(--gs-font-family, sans-serif);
                font-size: var(--gs-font-size, 14px);
                padding: 0;

                box-shadow: 0px 3px 15px 0px rgba(0, 0, 0, 0.21);
                background: var(--gs-dialog-background, white);
                color: var(--gs-dialog-text, #212529);
                border-radius: var(--gs-dialog-radius, 3px);
                border: none;
                min-width: 300px;

                opacity: 1;
                transition: opacity 0.2s ease-in-out;

                @starting-style {
                    opacity: 0;
                }

                @media (prefers-reduced-motion: no-preference) {
                    transform: translateY(0);
                    transition-property: opacity, transform;

                    @starting-style {
                        transform: translateY(-15px);
                    }
                }
            }

            dialog.closing {
                opacity: 0;

                @media (prefers-reduced-motion: no-preference) {
                    transform: translateY(-15px);
                }
            }

            dialog:modal {
                overscroll-behavior: contain;
            }

            dialog::backdrop {
                background-color: var(
                    --gs-dialog-backdrop,
                    rgb(75 75 75 / 40%)
                );
                opacity: 1;
                overflow: hidden;
                overscroll-behavior: contain;
                transition: opacity 0.3s ease-in-out;

                @starting-style {
                    opacity: 0;
                }
            }

            dialog.closing::backdrop {
                opacity: 0;
                transition-duration: 0.2s;
            }

            @media (prefers-reduced-motion: reduce) {
                dialog,
                dialog::backdrop,
                dialog.closing::backdrop {
                    transition-duration: 0.1s;
                }
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
                border-top: 1px solid
                    var(
                        --gs-dialog-stroke-color,
                        var(--gs-divider-color, #d0d0d0)
                    );
                padding: var(--gs-basic-spacing, 10px);

                > div {
                    display: flex;
                    justify-content: flex-end;
                    gap: var(--gs-basic-spacing, 10px);
                }
            }

            footer .btn.btn-primary {
                --gs-dialog-primary-bg: var(--gs-theme-primary, #51678d);
                background: var(
                    --gs-primary-button-background,
                    var(--gs-dialog-primary-bg)
                );
                border-color: oklch(
                    from var(--gs-dialog-primary-bg) calc(l - 0.08) c h
                );
                color: var(--gs-theme-on-primary, #ffffff);
            }

            footer .btn.btn-primary:hover:not(:disabled) {
                background: var(
                    --gs-primary-button-hover-background,
                    var(
                        --gs-primary-button-background,
                        oklch(
                            from var(--gs-dialog-primary-bg) calc(l - 0.05) c h
                        )
                    )
                );
            }

            footer .btn.btn-primary:disabled {
                background: var(
                    --gs-disabled-background,
                    oklch(from var(--gs-dialog-primary-bg) calc(l + 0.08) c h)
                );
                border-color: oklch(
                    from var(--gs-dialog-primary-bg) calc(l - 0.02) c h
                );
                color: var(
                    --gs-disabled-text,
                    oklch(from var(--gs-theme-on-primary, #ffffff) l c h / 0.6)
                );
            }
        `,
    ];

    constructor() {
        super();

        /** @type {string | import("lit").TemplateResult} Title text or Lit markup. */
        this.dialogTitle = null;

        /** @type {string | null} Space-separated IDs of description elements in the dialog's render root. */
        this.dialogDescribedBy = null;

        /** Open in the browser's modal top layer. Defaults to true. */
        this.modal = true;

        this.addEventListener("keydown", (/** @type {KeyboardEvent} */ e) => {
            this.#handleKeyDown(e);
            e.stopPropagation();
        });
    }

    /**
     * @param {KeyboardEvent} event
     */
    #handleKeyDown(event) {
        if (event.defaultPrevented) {
            return;
        }

        const isPlainEnter =
            event.key == "Enter" &&
            !event.isComposing &&
            !event.altKey &&
            !event.ctrlKey &&
            !event.metaKey;

        if (isPlainEnter) {
            const target = /** @type {HTMLElement | null} */ (
                event
                    .composedPath()
                    .find((entry) => entry instanceof HTMLElement)
            );
            if (this.#canTriggerDefaultAction(target)) {
                const primaryButton = this.#getPrimaryButton();
                if (primaryButton) {
                    event.preventDefault();
                    primaryButton.click();
                }
            }
        }
    }

    /**
     * @param {HTMLElement | null} target
     * @returns {boolean}
     */
    #canTriggerDefaultAction(target) {
        const root =
            this.renderRoot instanceof ShadowRoot ? this.renderRoot : null;
        const element =
            target ?? /** @type {HTMLElement | null} */ (root?.activeElement);
        if (!element) {
            return true;
        }

        const input = /** @type {HTMLInputElement | null} */ (
            element.closest("input")
        );
        if (!input) {
            return false;
        }

        const type = (input.type || "text").toLowerCase();
        return DEFAULT_ACTION_INPUT_TYPES.has(type);
    }

    #getPrimaryButton() {
        return /** @type {HTMLButtonElement | null} */ (
            this.renderRoot.querySelector(
                "footer button[data-primary]:not(:disabled)"
            )
        );
    }

    firstUpdated() {
        this.#dialog = this.renderRoot.querySelector("dialog");
        if (this.openOnConnect) {
            this.openDialog();
        }
    }

    /** Open the native dialog after the first render. @protected */
    openDialog() {
        if (this.#dialog.open) {
            return;
        }

        this.#dialog.classList.remove("closing");
        this.renderRoot
            .querySelector(".non-modal-backdrop")
            ?.classList.remove("closing");
        if (this.modal) {
            this.#dialog.showModal();
        } else {
            this.#dialog.show();
        }

        this.#focusAutofocusTarget();
    }

    #focusAutofocusTarget() {
        const autofocusTarget = /** @type {HTMLElement | null} */ (
            this.renderRoot.querySelector("[autofocus]")
        );
        if (!autofocusTarget) {
            return;
        }

        // Queue once immediately and once on the next frame so custom elements
        // have time to render internal focus targets.
        queueMicrotask(() => {
            if (!this.isConnected) {
                return;
            }
            autofocusTarget.focus();
        });

        requestAnimationFrame(() => {
            if (!this.isConnected) {
                return;
            }
            autofocusTarget.focus();
        });
    }

    /**
     * Subclasses call this to report the dialog result.
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
     * @param {Event} [event]
     */
    #onDialogCancel(event) {
        event?.preventDefault();
        if (!this.#dialog.open || this.#dialog.classList.contains("closing")) {
            return;
        }

        this.finish({ ok: false, reason: "cancel" });
        this.triggerClose();
    }

    #onDialogClose() {
        this.dispatchEvent(
            new CustomEvent("gs-dialog-closed", {
                bubbles: true,
                composed: true,
            })
        );
    }

    /**
     * @protected
     */
    triggerClose() {
        const dialog = this.#dialog;
        if (!dialog) {
            void this.updateComplete.then(() => this.triggerClose());
            return;
        }
        if (!dialog.open || dialog.classList.contains("closing")) {
            return;
        }

        dialog.classList.add("closing");
        this.renderRoot
            .querySelector(".non-modal-backdrop")
            ?.classList.add("closing");

        // Keep the dialog visible during its own fade, even in browsers
        // without CSS top-layer exit transitions.
        const fade = dialog
            .getAnimations()
            .find(
                (animation) =>
                    animation instanceof CSSTransition &&
                    animation.transitionProperty === "opacity"
            );
        if (fade) {
            const close = () => dialog.close();
            void fade.finished.then(close, close);
        } else {
            dialog.close();
        }
    }

    /**
     * @protected
     */
    onCloseButtonClick() {
        if (typeof this.#dialog.requestClose === "function") {
            this.#dialog.requestClose();
        } else {
            this.#onDialogCancel();
        }
    }

    /**
     * @protected
     * @returns {import("lit").HTMLTemplateResult}
     */
    renderHeader() {
        return html`${
            this.dialogTitle
                ? html`<span id="dialog-title">${this.dialogTitle}</span>`
                : nothing
        }`;
    }

    /**
     * @protected
     * @returns {import("lit").HTMLTemplateResult}
     */
    renderBody() {
        return html``;
    }

    /**
     * @protected
     * @returns {import("lit").HTMLTemplateResult | typeof nothing}
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
     * @returns {import("lit").HTMLTemplateResult[]}
     */
    renderButtons() {
        return [this.makeCloseButton()];
    }

    /**
     * Creates a button for the dialog footer.
     * The dialog is closed automatically unless the callback returns a truthy value.
     *
     * @param {string} title
     * @param {() => boolean | void | Promise<boolean | void>} callback If returns truthy value, dialog closing is canceled
     * @param {{
     *  iconDef?: import("@fortawesome/free-solid-svg-icons").IconDefinition,
     *  disabled?: boolean,
     *  preventMouseDown?: boolean,
     *  isPrimary?: boolean,
     * }} [options]
     * @protected
     * @returns {import("lit").HTMLTemplateResult}
     */
    makeButton(title, callback, options = {}) {
        const {
            iconDef,
            disabled = false,
            preventMouseDown = false,
            isPrimary = false,
        } = options;
        // Ugly hack. TODO: Allow defining icon position in the future
        const reverse = title == "Next";
        const classNames = ["btn"];
        if (reverse) {
            classNames.push("reverse");
        }
        if (isPrimary) {
            classNames.push("btn-primary");
        }
        return html`<button
            class=${classNames.join(" ")}
            part=${isPrimary ? "button primary-button" : "button"}
            type="button"
            title=${title}
            ?disabled=${disabled}
            ?data-primary=${isPrimary}
            @mousedown=${
                preventMouseDown
                    ? (/** @type {MouseEvent} */ event) =>
                          event.preventDefault()
                    : undefined
            }
            @click=${async () => {
                const cancelClose = !!(await callback());
                if (!cancelClose) {
                    this.triggerClose();
                }
            }}
        >
            ${iconDef ? renderIcon(iconDef) : nothing} ${title}
        </button>`;
    }

    /**
     * @protected
     * @returns {import("lit").HTMLTemplateResult}
     */
    makeCloseButton(label = "Close") {
        return this.makeButton(
            label,
            () => {
                this.onCloseButtonClick();
                return true;
            },
            { preventMouseDown: true }
        );
    }

    /**
     * @protected
     * @returns {import("lit").HTMLTemplateResult}
     */
    renderDialogContent() {
        const header = this.renderHeader();
        const footer = this.renderFooter();
        return html`
            ${header ? html`<header part="header">${header}</header>` : nothing}
            <section part="body">${this.renderBody()}</section>
            ${footer ? html`<footer part="footer">${footer}</footer>` : nothing}
        `;
    }

    /** @returns {import("lit").HTMLTemplateResult} */
    render() {
        return html`
            ${
                !this.modal
                    ? html`<div class="non-modal-backdrop"></div>`
                    : nothing
            }
            <dialog
                part="dialog"
                aria-labelledby=${this.dialogTitle ? "dialog-title" : nothing}
                aria-label="GenomeSpy"
                aria-describedby=${this.dialogDescribedBy || nothing}
                @cancel=${this.#onDialogCancel}
                @close=${this.#onDialogClose}
            >
                ${this.renderDialogContent()}
            </dialog>
        `;
    }
}

/**
 * @typedef {object} DialogOptions
 * @property {HTMLElement | ShadowRoot} [mount] Element or shadow root supplying the dialog's theme. Defaults to document.body.
 */

/**
 * Open a dialog and resolve to its result or a cancellation on close.
 *
 * @template {BaseDialog} T
 * @param {string} tagName - Custom element name, e.g. "gs-upload-dialog".
 * @param {(el: T) => void} [configure] - Optional function to configure props.
 * @param {DialogOptions} [options]
 * @returns {Promise<DialogFinishDetail>}
 */
export function showDialog(tagName, configure, options) {
    return showDialogWithElement(tagName, configure, options).promise;
}

/**
 * Open any dialog element that extends BaseDialog and map the result.
 *
 * @template {BaseDialog} T
 * @template R
 * @param {string} tagName - Custom element name, e.g. "gs-upload-dialog".
 * @param {((el: T) => void) | undefined} configure - Optional function to configure props.
 * @param {(detail: DialogFinishDetail) => R | Promise<R>} map
 * @param {DialogOptions} [options]
 * @returns {Promise<R>}
 */
export function showDialogAndMap(tagName, configure, map, options) {
    return showDialog(tagName, configure, options).then(map);
}

/**
 * Open any dialog element that extends BaseDialog and resolve to a boolean.
 *
 * @template {BaseDialog} T
 * @param {string} tagName - Custom element name, e.g. "gs-upload-dialog".
 * @param {(el: T) => void} [configure] - Optional function to configure props.
 * @param {DialogOptions} [options]
 * @returns {Promise<boolean>}
 */
export function showDialogOk(tagName, configure, options) {
    return showDialogAndMap(
        tagName,
        configure,
        (detail) => !!detail.ok,
        options
    );
}

/**
 * Open any dialog element that extends BaseDialog and return the element.
 * If the dialog closes without reporting a result, the promise resolves
 * to a cancellation.
 *
 * @template {BaseDialog} T
 * @param {string} tagName - Custom element name, e.g. "gs-upload-dialog".
 * @param {(el: T) => void} [configure] - Optional function to configure props.
 * @param {DialogOptions} [options]
 * @returns {{element: T, promise: Promise<DialogFinishDetail>}}
 */
export function showDialogWithElement(
    tagName,
    configure,
    { mount = document.body } = {}
) {
    const el = /** @type {T} */ (mount.ownerDocument.createElement(tagName));
    configure?.(el);

    const promise = new Promise((resolve) => {
        /** @param {CustomEvent<DialogFinishDetail>} event */
        const finish = (event) => {
            if (event.composedPath()[0] === el) {
                el.removeEventListener("gs-dialog-finished", finish);
                resolve(event.detail);
            }
        };
        /** @param {Event} event */
        const close = (event) => {
            if (event.composedPath()[0] === el) {
                el.removeEventListener("gs-dialog-finished", finish);
                el.removeEventListener("gs-dialog-closed", close);
                el.remove();
                resolve({ ok: false, reason: "cancel" });
            }
        };
        el.addEventListener("gs-dialog-finished", finish);
        el.addEventListener("gs-dialog-closed", close);
    });

    mount.appendChild(el);

    return { element: el, promise };
}
