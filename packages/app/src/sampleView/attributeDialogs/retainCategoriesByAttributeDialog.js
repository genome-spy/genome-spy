import { faFilter } from "@fortawesome/free-solid-svg-icons";
import { css, html } from "lit";
import BaseDialog, { showDialog } from "../../components/generic/baseDialog.js";

const OPERATOR_OPTIONS = [
    ["gt", ">"],
    ["gte", ">="],
    ["eq", "="],
    ["lte", "<="],
    ["lt", "<"],
];

class RetainCategoriesByAttributeDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        categoryAttributeInfo: {},
        conditionAttributeInfo: {},
        sampleView: {},
        operator: {},
        operand: {},
    };

    static styles = [
        ...super.styles,
        css`
            .retain-categories-form {
                width: 24em;
            }

            .condition-row {
                display: grid;
                grid-template-columns: auto 1fr;
                gap: var(--gs-basic-spacing);
                align-items: center;
            }
        `,
    ];

    constructor() {
        super();
        /** @type {import("../types.js").AttributeInfo} */
        this.categoryAttributeInfo = null;
        /** @type {import("../types.js").AttributeInfo} */
        this.conditionAttributeInfo = null;
        /** @type {import("../sampleView.js").default} */
        this.sampleView = null;
        /** @type {import("../state/payloadTypes.js").ComparisonOperatorType} */
        this.operator = "gt";
        this.operand = 0;
    }

    /** @param {Map<string, any>} changed */
    willUpdate(changed) {
        if (
            changed.has("categoryAttributeInfo") ||
            changed.has("conditionAttributeInfo")
        ) {
            this.dialogTitle = "Retain categories by condition";
        }
    }

    /** @param {Event} event */
    #operatorChanged(event) {
        this.operator =
            /** @type {import("../state/payloadTypes.js").ComparisonOperatorType} */ (
                /** @type {HTMLSelectElement} */ (event.target).value
            );
    }

    /** @param {Event} event */
    #operandChanged(event) {
        const value = Number(
            /** @type {HTMLInputElement} */ (event.target).value
        );
        if (Number.isFinite(value)) {
            this.operand = value;
        }
    }

    renderBody() {
        return html`<div class="gs-form-group retain-categories-form">
            <p>
                Retain all ${this.categoryAttributeInfo.title} categories where
                at least one sample has ${this.conditionAttributeInfo.title}
                matching:
            </p>
            <div class="condition-row">
                <select
                    .value=${this.operator}
                    @change=${(/** @type {Event} */ event) =>
                        this.#operatorChanged(event)}
                >
                    ${OPERATOR_OPTIONS.map(
                        ([value, label]) =>
                            html`<option value=${value}>${label}</option>`
                    )}
                </select>
                <input
                    type="number"
                    .value=${String(this.operand)}
                    @input=${(/** @type {Event} */ event) =>
                        this.#operandChanged(event)}
                />
            </div>
        </div>`;
    }

    renderButtons() {
        return [
            this.makeButton("Cancel", () => this.finish({ ok: false })),
            this.makeButton("Retain", () => this.#onRetain(), {
                iconDef: faFilter,
                isPrimary: true,
            }),
        ];
    }

    #onRetain() {
        this.sampleView.dispatchAttributeAction(
            this.sampleView.actions.retainCategoriesByAttribute({
                attribute: this.categoryAttributeInfo.attribute,
                condition: {
                    attribute: this.conditionAttributeInfo.attribute,
                    operator: this.operator,
                    operand: this.operand,
                },
            })
        );
        this.finish({ ok: true });
    }
}

customElements.define(
    "gs-retain-categories-by-attribute-dialog",
    RetainCategoriesByAttributeDialog
);

/**
 * @param {import("../types.js").AttributeInfo} categoryAttributeInfo
 * @param {import("../types.js").AttributeInfo} conditionAttributeInfo
 * @param {import("../sampleView.js").default} sampleView
 */
export function showRetainCategoriesByAttributeDialog(
    categoryAttributeInfo,
    conditionAttributeInfo,
    sampleView
) {
    return showDialog(
        "gs-retain-categories-by-attribute-dialog",
        (/** @type {any} */ el) => {
            el.categoryAttributeInfo = categoryAttributeInfo;
            el.conditionAttributeInfo = conditionAttributeInfo;
            el.sampleView = sampleView;
            el.operator = "gt";
            el.operand = 0;
        }
    );
}
