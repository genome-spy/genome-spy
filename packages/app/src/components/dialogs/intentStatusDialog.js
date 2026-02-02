import { html } from "lit";
import BaseDialog from "../generic/baseDialog.js";

export default class IntentStatusDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        message: {},
        cancelLabel: { type: String },
    };

    constructor() {
        super();
        /** @type {string | import("lit").TemplateResult} */
        this.message = "";
        this.cancelLabel = "Cancel";
        this.dialogTitle = "Processing";
    }

    renderBody() {
        return html`<div>${this.message}</div>`;
    }

    renderButtons() {
        return [
            this.makeButton(this.cancelLabel, () => {
                this.finish({ ok: true });
            }),
        ];
    }

    closeDialog() {
        this.triggerClose();
    }
}

customElements.define("gs-intent-status-dialog", IntentStatusDialog);

/**
 * @typedef {object} IntentStatusDialogOptions
 * @prop {string | import("lit").TemplateResult} message
 * @prop {string} [title]
 * @prop {string} [cancelLabel]
 */

/**
 * Opens a cancelable status dialog and returns the element + finish promise.
 *
 * @param {IntentStatusDialogOptions} options
 * @returns {{element: IntentStatusDialog, promise: Promise<import("../generic/baseDialog.js").DialogFinishDetail>}}
 */
export function showIntentStatusDialog(options) {
    /** @type {IntentStatusDialog} */
    const el = /** @type {IntentStatusDialog} */ (
        document.createElement("gs-intent-status-dialog")
    );
    el.message = options.message;
    el.dialogTitle = options.title ?? el.dialogTitle;
    if (options.cancelLabel) {
        el.cancelLabel = options.cancelLabel;
    }

    const promise = new Promise((resolve) => {
        el.addEventListener(
            "gs-dialog-finished",
            (
                /** @type {CustomEvent<import("../generic/baseDialog.js").DialogFinishDetail>} */ e
            ) => {
                resolve(e.detail);
            },
            { once: true }
        );
    });

    el.addEventListener("gs-dialog-closed", () => {
        el.remove();
    });

    document.body.appendChild(el);

    return { element: el, promise };
}
