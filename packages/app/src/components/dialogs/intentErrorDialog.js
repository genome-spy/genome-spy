import { css, html } from "lit";
import BaseDialog from "../generic/baseDialog.js";

export default class IntentErrorDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        message: {},
        rollbackLabel: { type: String },
        keepLabel: { type: String },
    };

    static styles = [
        ...super.styles,
        css`
            dialog {
                max-width: 600px;
            }
        `,
    ];

    constructor() {
        super();
        /** @type {string | import("lit").TemplateResult} */
        this.message = "";
        this.rollbackLabel = "Rollback entire batch";
        this.keepLabel = "Keep current state";
        this.dialogTitle = "Action interrupted";
    }

    renderBody() {
        return html`${this.message}`;
    }

    renderButtons() {
        return [
            this.makeButton(this.keepLabel, () => {
                this.finish({ ok: false, data: { decision: "accept" } });
            }),
            this.makeButton(this.rollbackLabel, () => {
                this.finish({
                    ok: true,
                    data: { decision: "rollbackBatch" },
                });
            }),
        ];
    }
}

customElements.define("gs-intent-error-dialog", IntentErrorDialog);

/**
 * @typedef {object} IntentErrorDialogOptions
 * @prop {string | import("lit").TemplateResult} message
 * @prop {string} [title]
 * @prop {string} [rollbackLabel]
 * @prop {string} [keepLabel]
 */

/**
 * Opens an error dialog and resolves with the chosen decision.
 *
 * @param {IntentErrorDialogOptions} options
 * @returns {Promise<"rollbackBatch" | "accept">}
 */
export function showIntentErrorDialog(options) {
    /** @type {IntentErrorDialog} */
    const el = /** @type {IntentErrorDialog} */ (
        document.createElement("gs-intent-error-dialog")
    );
    el.message = options.message;
    el.dialogTitle = options.title ?? el.dialogTitle;
    if (options.rollbackLabel) {
        el.rollbackLabel = options.rollbackLabel;
    }
    if (options.keepLabel) {
        el.keepLabel = options.keepLabel;
    }

    const promise = new Promise((resolve) => {
        el.addEventListener(
            "gs-dialog-finished",
            (
                /** @type {CustomEvent<import("../generic/baseDialog.js").DialogFinishDetail>} */ e
            ) => {
                const decision =
                    /** @type {{ decision?: "rollbackBatch" | "accept" }} */ (
                        e.detail?.data
                    )?.decision;
                resolve(decision ?? "accept");
            },
            { once: true }
        );
    });

    el.addEventListener("gs-dialog-closed", () => {
        el.remove();
    });

    document.body.appendChild(el);

    return promise;
}
