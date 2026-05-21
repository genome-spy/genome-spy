import { faFilter } from "@fortawesome/free-solid-svg-icons";
import { css, html, nothing } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import BaseDialog, { showDialog } from "../../components/generic/baseDialog.js";
import "../../components/generic/searchableCheckboxList.js";
import { isFiniteNumber } from "../../components/generic/thresholdComparisonInput.js";
import { extractAttributeValues } from "../attributeValues.js";

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
                width: 25em;
            }

            .gs-form-group {
                .requirement-row {
                    margin-top: var(--gs-basic-spacing);
                    display: grid;
                    gap: 0.2em;

                    label {
                        margin-bottom: 0;
                    }
                }
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
        /** @type {number | undefined} */
        this.operand = undefined;
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

    /** @param {import("../../components/generic/thresholdComparisonInput.js").ThresholdComparisonInputChangeEvent} event */
    #thresholdComparisonChanged(event) {
        this.operator = event.operator;
        this.operand = event.operand;
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
        const values = extractAttributeValues(
            this.conditionAttributeInfo,
            this.sampleView.leafSamples,
            this.sampleView.sampleHierarchy
        );

        return html`<gs-threshold-comparison-input
            autofocus
            .values=${values}
            .operator=${this.operator}
            .operand=${this.operand}
            @change=${(
                /** @type {import("../../components/generic/thresholdComparisonInput.js").ThresholdComparisonInputChangeEvent} */ event
            ) => this.#thresholdComparisonChanged(event)}
        ></gs-threshold-comparison-input>`;
    }

    #renderCategoricalCondition() {
        return html`
            <gs-searchable-checkbox-list
                autofocus
                .items=${this.#getCategoryItems()}
                .selectedValues=${this.values}
                .selectedItemName=${"values"}
                .itemMarker=${this.#getCategoryToMarker()}
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
                disabled: this.#isRetainDisabled(),
            }),
        ];
    }

    #isRetainDisabled() {
        if (this.conditionAttributeInfo?.type === "quantitative") {
            return !isFiniteNumber(this.operand);
        }

        return this.values.length === 0;
    }

    #onRetain() {
        /** @type {import("../state/payloadTypes.js").AttributeCondition} */
        let condition;
        if (this.conditionAttributeInfo.type === "quantitative") {
            if (!isFiniteNumber(this.operand)) {
                throw new Error(
                    "Quantitative category condition is missing a value."
                );
            }

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

    /**
     * @returns {(value: import("@genome-spy/core/spec/channel.js").Scalar) => import("lit").TemplateResult | typeof nothing}
     */
    #getCategoryToMarker() {
        const scale = this.conditionAttributeInfo.scale;
        if (!scale) {
            return () => nothing;
        }

        return (value) =>
            html`<span
                class="color"
                style=${styleMap({
                    backgroundColor: scale(value).toString(),
                })}
            ></span>`;
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
            el.operand = undefined;
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
