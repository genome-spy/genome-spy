import {
    faExclamationTriangle,
    faInfoCircle,
    faTimesCircle,
} from "@fortawesome/free-solid-svg-icons";
import { css, html, nothing } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import BaseDialog, { showDialog } from "./baseDialog.js";

/**
 * @type {Record<string, import("@fortawesome/fontawesome-svg-core").IconDefinition>}
 */
const icons = {
    warning: faExclamationTriangle,
    error: faTimesCircle,
    info: faInfoCircle,
};

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
                gap: calc(var(--gs-basic-spacing) * 2);
                padding: var(--gs-basic-spacing);
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
        /** @type {string | import("lit").TemplateResult} */
        this.message = "";
        this.type = "info";
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
                ${iconDef
                    ? html`<div class="icon">${icon(iconDef).node[0]}</div>`
                    : nothing}
                <div class="message">${this.message}</div>
            </div>`;
        } else {
            return html`${this.message}`;
        }
    }
}

customElements.define("gs-message-dialog", MessageDialog);

/**
 * @typedef {object} MessageDialogOptions
 * @property {string | import("lit").TemplateResult} [title]
 * @property {"warning" | "error" | "info"} [type]
 * @property {boolean} [confirm] If true, shows OK and Cancel buttons
 * @property {import("lit").TemplateResult<any>[]} [customButtons] Custom buttons to show instead of default ones
 */
/**
 *
 * @param {string | import("lit").TemplateResult} message
 * @param {MessageDialogOptions} [options]
 * @returns {Promise<boolean>} Resolves to true if OK was clicked
 */
export function showMessageDialog(message, options = {}) {
    return showDialog(
        "gs-message-dialog",
        (/** @type {MessageDialog} */ el) => {
            el.message = message;
            el.dialogTitle = options.title;
            el.type = options.type;
            el.confirm = options.confirm;
        }
    ).then((result) => {
        return result.ok;
    });
}
