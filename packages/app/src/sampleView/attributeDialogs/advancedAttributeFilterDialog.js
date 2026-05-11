import { faFilter, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import { html, nothing } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { isContinuous, isDiscrete, isDiscretizing } from "vega-scale";
import { showMessageDialog } from "../../components/generic/messageDialog.js";
import "../../components/generic/comparisonOperatorButtons.js";
import "../../components/generic/histogram.js";
import "../../components/generic/searchableCheckboxList.js";
import BaseDialog, { showDialog } from "../../components/generic/baseDialog.js";
import { createInputListener } from "../../components/dialogs/saveImageDialog.js";
import { extractAttributeValues } from "../attributeValues.js";

class DiscreteAttributeFilterDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        categories: {},
        attributeInfo: {},
        sampleView: {},
        categoryToMarker: {},
    };

    constructor() {
        super();
        /** @type {import("../../components/generic/searchableCheckboxList.js").SearchableCheckboxListItem[]} */
        this.categories = [];
        /** @type {any|null} */
        this.attributeInfo = null;
        /** @type {any|null} */
        this.sampleView = null;
        /** @type {(category: import("@genome-spy/core/spec/channel.js").Scalar) => import("lit").TemplateResult | typeof nothing} */
        this.categoryToMarker = () => nothing;
        /** @type {import("@genome-spy/core/spec/channel.js").Scalar[]} */
        this.selection = [];
    }

    willUpdate(/** @type {Map<string, any>} */ changed) {
        if (changed.has("attributeInfo")) {
            this.dialogTitle = `Filter by ${this.attributeInfo.name}`;
        }
    }

    renderBody() {
        return html`<div class="gs-form-group">
            <p>Select one or more categories and choose an action.</p>
            <gs-searchable-checkbox-list
                autofocus
                .items=${this.categories}
                .selectedValues=${this.selection}
                .selectedItemName=${"categories"}
                .itemMarker=${this.categoryToMarker}
                @change=${(
                    /** @type {import("../../components/generic/searchableCheckboxList.js").SearchableCheckboxListChangeEvent} */ event
                ) => {
                    this.selection = event.values;
                }}
            ></gs-searchable-checkbox-list>
        </div>`;
    }

    renderButtons() {
        return [
            this.makeButton("Cancel", () => this.finish({ ok: false })),
            this.makeButton("Remove", () => this.#onRetain(true), {
                iconDef: faTrashAlt,
            }),
            this.makeButton("Retain", () => this.#onRetain(false), {
                iconDef: faFilter,
                isPrimary: true,
            }),
        ];
    }

    /** @param {boolean} remove */
    #onRetain(remove) {
        this.sampleView.dispatchAttributeAction(
            this.sampleView.actions.filterByNominal({
                values: this.categories
                    .map((c) => c.value)
                    .filter((value) => this.selection.includes(value)),
                attribute: this.attributeInfo.attribute,
                remove,
            })
        );
        this.finish({ ok: true });
    }
}

customElements.define(
    "gs-discrete-attribute-filter-dialog",
    DiscreteAttributeFilterDialog
);

class QuantitativeAttributeFilterDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        attributeInfo: {},
        sampleView: {},
        operator: {},
        operand: {},
    };

    constructor() {
        super();
        /** @type {import("../types.js").AttributeInfo} */
        this.attributeInfo = null;
        /** @type {import("../sampleView.js").default} */
        this.sampleView = null;
        this.operator = "lt";
        /** @type {number} */
        this.operand = undefined;
    }

    willUpdate(/** @type {Map<string, any>} */ changed) {
        if (changed.has("attributeInfo")) {
            this.dialogTitle = `Filter by ${this.attributeInfo.name}`;
        }
    }

    /** @param {import("../../components/generic/comparisonOperatorButtons.js").ComparisonOperatorChangeEvent} event */
    #operatorChanged(event) {
        this.operator = event.value;
    }

    /** @param {HTMLInputElement} input */
    #operandChanged(input) {
        const value = input.value;
        if (/^\d+(\.(\d+)?)?$/.test(value)) {
            this.operand = +value;
        }
    }

    /** @param {import("../../components/generic/histogram.js").ThresholdEvent} e */
    #thresholdAdded(e) {
        const val = /** @type {any} */ (e).detail?.value ?? e.value;
        if (typeof this.operand !== "number") this.operand = val;
    }

    /** @param {import("../../components/generic/histogram.js").ThresholdEvent} e */
    #thresholdAdjusted(e) {
        this.operand = /** @type {any} */ (e).detail?.value ?? e.value;
    }

    renderBody() {
        const values = extractAttributeValues(
            this.attributeInfo,
            this.sampleView.leafSamples,
            this.sampleView.sampleHierarchy
        );

        return html`<div class="gs-form-group">
            <label
                >Retain samples where
                <em>${this.attributeInfo.name}</em> is</label
            >
            <gs-comparison-operator-buttons
                style="margin-bottom: 1em;"
                .value=${this.operator}
                @change=${(
                    /** @type {import("../../components/generic/comparisonOperatorButtons.js").ComparisonOperatorChangeEvent} */ event
                ) => this.#operatorChanged(event)}
            ></gs-comparison-operator-buttons>

            <gs-histogram
                .values=${values}
                .thresholds=${[this.operand].filter((o) => o !== undefined)}
                .operators=${[this.operator]}
                .colors=${["#1f77b4", "#ddd"]}
                .showThresholdNumbers=${false}
                @add=${(
                    /** @type {import("../../components/generic/histogram.js").ThresholdEvent} */ e
                ) => this.#thresholdAdded(e)}
                @adjust=${(
                    /** @type {import("../../components/generic/histogram.js").ThresholdEvent} */ e
                ) => this.#thresholdAdjusted(e)}
            ></gs-histogram>

            <input
                autofocus
                type="text"
                placeholder="... or enter a numeric value here"
                style="margin-top: 0.5em"
                .value=${typeof this.operand == "number"
                    ? "" + this.operand
                    : ""}
                @input=${createInputListener((input) =>
                    this.#operandChanged(input)
                )}
            />
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
            this.sampleView.actions.filterByQuantitative({
                attribute: this.attributeInfo.attribute,
                operator: /** @type {ComparisonOperatorType} */ (this.operator),
                operand: this.operand,
            })
        );
        this.finish({ ok: true });
    }
}

customElements.define(
    "gs-quantitative-attribute-filter-dialog",
    QuantitativeAttributeFilterDialog
);

/**
 * @typedef {import("@genome-spy/core/spec/channel.js").Scalar} Scalar
 * @typedef {import("../state/sampleOperations.js").ComparisonOperatorType} ComparisonOperatorType
 */

/**
 * @param {import("../types.js").AttributeInfo} attribute
 * @param {import("../sampleView.js").default} sampleView TODO: Figure out a better way to pass typings
 */
export function advancedAttributeFilterDialog(attribute, sampleView) {
    const type = attribute.scale?.type;
    if (isDiscrete(type)) {
        discreteScaleAttributeFilterDialog(attribute, sampleView);
    } else if (isContinuous(type) || isDiscretizing(type)) {
        quantitativeAttributeFilterDialog(attribute, sampleView);
    } else if (attribute.type === "identifier") {
        identifierAttributeFilterDialog(attribute, sampleView);
    } else {
        showMessageDialog("Not implemented (yet).");
    }
}

/**
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {import("../sampleView.js").default} sampleView TODO: Figure out a better way to pass typings
 */
export function identifierAttributeFilterDialog(attributeInfo, sampleView) {
    discreteAttributeFilterDialog(
        sampleView.getSamples().map((sample) => sample.id),
        attributeInfo,
        sampleView
    );
}

/**
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {import("../sampleView.js").default} sampleView TODO: Figure out a better way to pass typings
 */
export function discreteScaleAttributeFilterDialog(attributeInfo, sampleView) {
    const scale =
        /** @type {import("d3-scale").ScaleOrdinal<Scalar, Scalar>} */ (
            attributeInfo.scale
        );

    const categoryToMarker = (/** @type {Scalar} */ value) =>
        html`<span
            class="color"
            style=${styleMap({
                backgroundColor: scale(value).toString(),
            })}
        ></span>`;

    discreteAttributeFilterDialog(
        scale.domain(),
        attributeInfo,
        sampleView,
        categoryToMarker
    );
}

/**
 * @param {Scalar[]} categories
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {import("../sampleView.js").default} sampleView TODO: Figure out a better way to pass typings
 * @param {(value: Scalar) => (import("lit").TemplateResult | typeof nothing)} [categoryToMarker]
 */
export function discreteAttributeFilterDialog(
    categories,
    attributeInfo,
    sampleView,
    categoryToMarker = (value) => nothing
) {
    const presentValues = new Set(
        extractAttributeValues(
            attributeInfo,
            sampleView.leafSamples,
            sampleView.sampleHierarchy
        )
    );

    const categoryObjects = categories
        .filter((value) => presentValues.has(value))
        .map((value) => ({
            value,
            label: `${value}`,
            searchText: `${value}`.toLowerCase(),
        }));

    return showDialog(
        "gs-discrete-attribute-filter-dialog",
        (/** @type {any} */ el) => {
            el.categories = categoryObjects;
            el.attributeInfo = attributeInfo;
            el.sampleView = sampleView;
            el.categoryToMarker = categoryToMarker;
        }
    );
}

/**
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {import("../sampleView.js").default} sampleView TODO: Figure out a better way to pass typings
 */
export function quantitativeAttributeFilterDialog(attributeInfo, sampleView) {
    return showDialog(
        "gs-quantitative-attribute-filter-dialog",
        (/** @type {any} */ el) => {
            el.attributeInfo = attributeInfo;
            el.sampleView = sampleView;
        }
    );
}
