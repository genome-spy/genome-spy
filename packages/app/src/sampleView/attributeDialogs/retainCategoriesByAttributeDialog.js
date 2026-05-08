import { faFilter } from "@fortawesome/free-solid-svg-icons";
import { css, html } from "lit";
import BaseDialog, { showDialog } from "../../components/generic/baseDialog.js";
import "../../components/generic/searchableCheckboxList.js";
import { extractAttributeValues } from "../attributeValues.js";

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
        values: {},
        required: {},
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

            .requirement-row {
                display: grid;
                gap: 0.35em;
                margin-top: var(--gs-basic-spacing);
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
        /** @type {import("@genome-spy/core/spec/channel.js").Scalar[]} */
        this.values = [];
        /** @type {"any" | "all"} */
        this.required = "any";
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
                ${this.conditionAttributeInfo.type === "quantitative"
                    ? "at least one sample has"
                    : "samples have"}
                ${this.conditionAttributeInfo.title} matching:
            </p>
            ${this.conditionAttributeInfo.type === "quantitative"
                ? this.#renderQuantitativeCondition()
                : this.#renderCategoricalCondition()}
        </div>`;
    }

    #renderQuantitativeCondition() {
        return html`<div class="condition-row">
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
        </div>`;
    }

    #renderCategoricalCondition() {
        return html`
            <gs-searchable-checkbox-list
                autofocus
                .items=${this.#getCategoryItems()}
                .selectedValues=${this.values}
                .selectedItemName=${"values"}
                @change=${(
                    /** @type {import("../../components/generic/searchableCheckboxList.js").SearchableCheckboxListChangeEvent} */ event
                ) => {
                    this.values = event.values;
                }}
            ></gs-searchable-checkbox-list>
            <div class="requirement-row">
                <label>
                    <input
                        type="radio"
                        name="required"
                        value="any"
                        .checked=${this.required === "any"}
                        @change=${() => {
                            this.required = "any";
                        }}
                    />
                    Any selected value exists
                </label>
                <label>
                    <input
                        type="radio"
                        name="required"
                        value="all"
                        .checked=${this.required === "all"}
                        @change=${() => {
                            this.required = "all";
                        }}
                    />
                    All selected values exist
                </label>
            </div>
        `;
    }

    renderButtons() {
        return [
            this.makeButton("Cancel", () => this.finish({ ok: false })),
            this.makeButton("Retain", () => this.#onRetain(), {
                iconDef: faFilter,
                isPrimary: true,
                disabled:
                    this.conditionAttributeInfo?.type !== "quantitative" &&
                    this.values.length === 0,
            }),
        ];
    }

    #onRetain() {
        /** @type {import("../state/payloadTypes.js").AttributeCondition} */
        let condition;
        if (this.conditionAttributeInfo.type === "quantitative") {
            condition = {
                attribute: this.conditionAttributeInfo.attribute,
                operator: this.operator,
                operand: this.operand,
            };
        } else {
            condition = {
                attribute: this.conditionAttributeInfo.attribute,
                operator: "in",
                values: this.values,
                required: this.required,
            };
        }

        this.sampleView.dispatchAttributeAction(
            this.sampleView.actions.retainCategoriesByAttribute({
                attribute: this.categoryAttributeInfo.attribute,
                condition,
            })
        );
        this.finish({ ok: true });
    }

    /**
     * @returns {import("../../components/generic/searchableCheckboxList.js").SearchableCheckboxListItem[]}
     */
    #getCategoryItems() {
        return getAttributeCategories(
            this.conditionAttributeInfo,
            this.sampleView
        ).map((value) => ({
            value,
            label: `${value}`,
            searchText: `${value}`.toLowerCase(),
        }));
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
            el.values = [];
            el.required = "any";
        }
    );
}

/**
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {import("../sampleView.js").default} sampleView
 * @returns {import("@genome-spy/core/spec/channel.js").Scalar[]}
 */
function getAttributeCategories(attributeInfo, sampleView) {
    const domain = attributeInfo.scale?.domain?.();
    if (Array.isArray(domain)) {
        return domain.filter((value) =>
            getPresentValues(attributeInfo, sampleView).has(value)
        );
    }

    return Array.from(getPresentValues(attributeInfo, sampleView));
}

/**
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {import("../sampleView.js").default} sampleView
 * @returns {Set<import("@genome-spy/core/spec/channel.js").Scalar>}
 */
function getPresentValues(attributeInfo, sampleView) {
    return new Set(
        extractAttributeValues(
            attributeInfo,
            sampleView.leafSamples,
            sampleView.sampleHierarchy
        )
    );
}
