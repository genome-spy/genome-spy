import {
    faExclamationTriangle,
    faInfoCircle,
    faTimesCircle,
} from "@fortawesome/free-solid-svg-icons";
import { css, html, nothing } from "lit";
import { renderIcon } from "./icon.js";
import BaseDialog, { showDialogOk } from "./dialog.js";

/**
 * @type {Record<string, import("@fortawesome/free-solid-svg-icons").IconDefinition>}
 */
const icons = {
    warning: faExclamationTriangle,
    error: faTimesCircle,
    info: faInfoCircle,
};

/**
 * Show an informational message or ask for confirmation. The showMessageDialog()
 * helper registers the element, opens it, and resolves to the user's choice.
 *
 * @tag gs-message-dialog
 */
export default class MessageDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        message: {},
        type: { type: String },
        confirm: { type: Boolean },
    };

    static styles = [
        ...super.styles,
        css`
            .message-flex {
                display: flex;
                flex-direction: row;
                align-items: center;
                gap: calc(var(--gs-basic-spacing, 10px) * 2);
                padding: var(--gs-basic-spacing, 10px);
                box-sizing: border-box;
                max-width: 400px;
            }

            .icon svg {
                height: 3em;
            }
        `,
    ];

    constructor() {
        super();
        /** @type {string | import("lit").TemplateResult} Message text or Lit markup. */
        this.message = "";
        /** Message severity. Use info, warning, or error for the corresponding icon. */
        this.type = "info";
        /** Display OK and Cancel. Otherwise the dialog has a single Close button. */
        this.confirm = false;
    }

    renderButtons() {
        if (this.confirm) {
            return [
                this.makeCloseButton("Cancel"),
                this.makeButton(
                    "OK",
                    () => {
                        this.finish({ ok: true });
                        this.triggerClose();
                    },
                    { isPrimary: true }
                ),
            ];
        } else {
            return super.renderButtons();
        }
    }

    renderBody() {
        if (this.type) {
            const iconDef = icons[this.type];
            return html`<div class="message-flex">
                ${
                    iconDef
                        ? html`<div class="icon">${renderIcon(iconDef)}</div>`
                        : nothing
                }
                <div class="message">${this.message}</div>
            </div>`;
        } else {
            return html`${this.message}`;
        }
    }
}

export function defineMessageDialog(registry = customElements) {
    if (!registry.get("gs-message-dialog")) {
        registry.define("gs-message-dialog", MessageDialog);
    }
}

/**
 * @typedef {object} MessageDialogOptions
 * @property {string | import("lit").TemplateResult} [title]
 * @property {"warning" | "error" | "info"} [type]
 * @property {boolean} [confirm] If true, shows OK and Cancel buttons
 * @property {import("lit").TemplateResult<any>[]} [customButtons] Reserved for future use.
 * @property {HTMLElement | ShadowRoot} [mount] Container that supplies the theme
 */
/**
 * Show a message or request confirmation. For a themed dialog, pass the
 * themed container as `mount`. Use `confirm: true` to ask for a decision.
 * @param {string | import("lit").TemplateResult} message
 * @param {MessageDialogOptions} [options]
 * @returns {Promise<boolean>} Resolves to true if OK was clicked
 */
export function showMessageDialog(message, options = {}) {
    defineMessageDialog(
        options.mount?.ownerDocument.defaultView.customElements
    );
    return showDialogOk(
        "gs-message-dialog",
        (/** @type {MessageDialog} */ el) => {
            el.message = message;
            el.dialogTitle = options.title;
            el.type = options.type;
            el.confirm = options.confirm;
        },
        options
    );
}
