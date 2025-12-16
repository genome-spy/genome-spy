import { html } from "lit";
import { faFilter } from "@fortawesome/free-solid-svg-icons";
import BaseDialog, { showDialog } from "../../components/generic/baseDialog.js";
import { createInputListener } from "../../components/dialogs/saveImageDialog.js";

/**
 * Dialog to retain first N categories of an attribute.
 */
export class RetainFirstNCategoriesDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        attributeInfo: {},
        sampleView: {},
        n: { type: Number },
    };

    constructor() {
        super();
        /** @type {any} */
        this.attributeInfo = null;
        /** @type {any} */
        this.sampleView = null;
        this.n = 5;
    }

    firstUpdated() {
        super.firstUpdated?.();
        const title = this.attributeInfo?.title ?? "attribute";
        this.dialogTitle = html`Retain first n categories of <em>${title}</em>`;
    }

    renderBody() {
        return html`
            <div class="gs-form-group">
                <label>Number of categories to retain:</label>
                <input
                    autofocus
                    type="number"
                    min="1"
                    .valueAsNumber=${this.n}
                    @change=${createInputListener((input) => {
                        this.n = input.valueAsNumber;
                    })}
                />
            </div>
        `;
    }

    renderButtons() {
        return [
            this.makeButton("Cancel", () => {
                this.finish({ ok: false });
            }),
            this.makeButton("Retain", () => this.#onRetain(), faFilter),
        ];
    }

    #onRetain() {
        try {
            this.sampleView.dispatchAttributeAction(
                this.sampleView.actions.retainFirstNCategories({
                    attribute: this.attributeInfo.attribute,
                    n: this.n,
                })
            );
            this.finish({ ok: true, data: { n: this.n } });
        } catch (e) {
            console.warn(e);
            this.finish({ ok: false, reason: "error" });
        }
    }
}

customElements.define(
    "gs-retain-first-n-categories-dialog",
    RetainFirstNCategoriesDialog
);

/**
 * Open a dialog to retain the first N categories for an attribute.
 * Kept as the default export for compatibility with existing callers.
 *
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {import("../sampleView.js").default} sampleView
 * @returns {Promise<import("../../components/generic/baseDialog.js").DialogFinishDetail>}
 */
export default function retainFirstNCategoriesDialog(
    attributeInfo,
    sampleView
) {
    return showDialog(
        "gs-retain-first-n-categories-dialog",
        (/** @type {any} */ el) => {
            el.attributeInfo = attributeInfo;
            el.sampleView = sampleView;
        }
    );
}
