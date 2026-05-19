import { icon } from "@fortawesome/fontawesome-svg-core";
import { faExclamationCircle, faPlus } from "@fortawesome/free-solid-svg-icons";
import { html } from "lit";
import BaseDialog, { showDialog } from "../../components/generic/baseDialog.js";
import { formatAggregationLabel } from "../attributeAggregation/aggregationOps.js";
import { handleAddToMetadata } from "./deriveMetadataFlow.js";
import { collectIntervalRecordFieldValues } from "../selectionRecordFieldValues.js";
import "../../components/generic/comparisonOperatorButtons.js";
import "../../components/generic/searchableCheckboxList.js";

/**
 * @typedef {{
 *     aggregation: import("../types.js").AggregationOp;
 *     recordFilter: import("../sampleViewTypes.js").RecordFilter;
 * }} RecordFilteredAggregationConfig
 */

class RecordFilteredAggregationDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        fieldInfo: {},
        selectionIntervalComplex: {},
        selectionIntervalSource: {},
        aggregation: { state: true },
        filterField: { state: true },
        operator: { state: true },
        valueText: { state: true },
        selectedValues: { state: true },
    };

    constructor() {
        super();

        /** @type {import("../selectionAggregationCandidates.js").SelectionAggregationFieldInfo | null} */
        this.fieldInfo = null;

        /** @type {import("../types.js").Interval | null} */
        this.selectionIntervalComplex = null;

        /** @type {import("../sampleViewTypes.js").SelectionIntervalSource | null} */
        this.selectionIntervalSource = null;

        /** @type {import("../types.js").AggregationOp} */
        this.aggregation = "count";

        /** @type {string} */
        this.filterField = "";

        /** @type {import("../sampleViewTypes.js").RecordFilter["operator"]} */
        this.operator = "in";

        /** @type {string} */
        this.valueText = "";

        /** @type {import("@genome-spy/core/spec/channel.js").Scalar[]} */
        this.selectedValues = [];

        this.dialogTitle =
            "Derive metadata by filtering and aggregating features";
    }

    /** @param {Map<string, any>} changed */
    willUpdate(changed) {
        if (changed.has("fieldInfo") && this.fieldInfo) {
            this.dialogTitle =
                "Derive metadata by filtering and aggregating features";
            this.aggregation = this.fieldInfo.supportedAggregations.includes(
                "count"
            )
                ? "count"
                : this.fieldInfo.supportedAggregations[0];
            this.filterField = this.fieldInfo.filterableFields[0]?.field ?? "";
            this.operator = this.#isQuantitativeFilter() ? "gt" : "in";
            this.selectedValues = [];
        }
    }

    renderBody() {
        if (!this.fieldInfo) {
            throw new Error(
                "Record-filtered aggregation dialog is missing field info."
            );
        }

        return html`
            ${this.#renderInfoBox()}

            <div class="gs-form-group">
                <label for="recordFilterField">Feature filter field</label>
                <select
                    id="recordFilterField"
                    .value=${this.filterField}
                    @change=${(/** @type {Event} */ event) =>
                        this.#filterFieldChanged(event)}
                >
                    ${this.fieldInfo.filterableFields.map(
                        (field) => html`
                            <option value=${field.field}>
                                ${field.field} (${field.type})
                            </option>
                        `
                    )}
                </select>
            </div>

            <div class="gs-form-group">
                <label>Predicate</label>
                ${this.#isQuantitativeFilter()
                    ? this.#renderQuantitativePredicate()
                    : this.#renderCategoricalPredicate()}
            </div>

            <div class="gs-form-group">
                <label for="recordAggregation">Aggregation</label>
                <select
                    id="recordAggregation"
                    .value=${this.aggregation}
                    @change=${(/** @type {Event} */ event) => {
                        this.aggregation =
                            /** @type {import("../types.js").AggregationOp} */ (
                                /** @type {HTMLSelectElement} */ (event.target)
                                    .value
                            );
                    }}
                >
                    ${this.fieldInfo.supportedAggregations.map(
                        (op) => html`<option value=${op}>${op}</option>`
                    )}
                </select>
                <small>
                    ${this.aggregation === "count"
                        ? "Count features that match the predicate."
                        : html`${formatAggregationLabel(this.aggregation)} of
                              <em>${this.fieldInfo.field}</em> over features
                              that match the predicate.`}
                </small>
            </div>
        `;
    }

    renderButtons() {
        return [
            this.makeCloseButton(),
            this.makeButton("Continue", () => this.#onContinue(), {
                iconDef: faPlus,
                isPrimary: true,
                disabled: !this.#canContinue(),
            }),
        ];
    }

    /** @param {Event} event */
    #filterFieldChanged(event) {
        this.filterField = /** @type {HTMLSelectElement} */ (
            event.target
        ).value;
        this.operator = this.#isQuantitativeFilter() ? "gt" : "in";
        this.valueText = "";
        this.selectedValues = [];
    }

    #renderQuantitativePredicate() {
        return html`<div class="input-group">
            <gs-comparison-operator-buttons
                .value=${this.operator}
                @change=${(
                    /** @type {import("../../components/generic/comparisonOperatorButtons.js").ComparisonOperatorChangeEvent} */ event
                ) => {
                    this.operator = event.value;
                }}
            ></gs-comparison-operator-buttons>
            <input
                autofocus
                type="number"
                .value=${this.valueText}
                placeholder="value"
                @input=${(/** @type {Event} */ event) => {
                    this.valueText = /** @type {HTMLInputElement} */ (
                        event.target
                    ).value;
                }}
            />
        </div>`;
    }

    #renderCategoricalPredicate() {
        return html`
            <gs-searchable-checkbox-list
                autofocus
                .items=${this.#getCategoryItems()}
                .selectedValues=${this.selectedValues}
                .selectedItemName=${"values"}
                @change=${(
                    /** @type {import("../../components/generic/searchableCheckboxList.js").SearchableCheckboxListChangeEvent} */ event
                ) => {
                    this.selectedValues = event.values;
                }}
            ></gs-searchable-checkbox-list>
        `;
    }

    #renderInfoBox() {
        return html`
            <div class="gs-alert info">
                ${icon(faExclamationCircle).node[0]}
                <div>
                    <p>
                        You are deriving a new sample metadata attribute from
                        features in the selected interval.
                    </p>
                    <p>
                        For each sample, features are first filtered where
                        <em
                            >${this.filterField ||
                            "the selected feature field"}</em
                        >
                        matches the predicate. ${this.#renderAggregationStep()}
                        Continue opens the derived metadata dialog for naming,
                        grouping, and scale configuration.
                    </p>
                </div>
            </div>
        `;
    }

    #renderAggregationStep() {
        if (!this.fieldInfo) {
            return "";
        }

        if (this.aggregation === "count") {
            return html`Then it counts the matching features for that sample.`;
        }

        return html`Then it computes ${formatAggregationLabel(this.aggregation)}
            of <em>${this.fieldInfo.field}</em> for that sample.`;
    }

    #isQuantitativeFilter() {
        return this.#filterFieldInfo()?.type === "quantitative";
    }

    #filterFieldInfo() {
        return this.fieldInfo?.filterableFields.find(
            (field) => field.field === this.filterField
        );
    }

    #canContinue() {
        if (!this.filterField) {
            return false;
        }

        if (this.#isQuantitativeFilter()) {
            return (
                this.valueText.trim().length > 0 &&
                Number.isFinite(+this.valueText)
            );
        }

        return this.selectedValues.length > 0;
    }

    #onContinue() {
        if (!this.#canContinue()) {
            return true;
        }

        this.finish({
            ok: true,
            data: {
                aggregation: this.aggregation,
                recordFilter: this.#createRecordFilter(),
            },
        });
        return false;
    }

    /**
     * @returns {import("../sampleViewTypes.js").RecordFilter}
     */
    #createRecordFilter() {
        if (!this.#isQuantitativeFilter()) {
            return {
                field: this.filterField,
                operator: "in",
                values: this.selectedValues,
            };
        }

        return {
            field: this.filterField,
            operator: /** @type {"eq" | "lt" | "lte" | "gt" | "gte"} */ (
                this.operator
            ),
            value: +this.valueText,
        };
    }

    /**
     * @returns {import("../../components/generic/searchableCheckboxList.js").SearchableCheckboxListItem[]}
     */
    #getCategoryItems() {
        if (!this.fieldInfo || !this.selectionIntervalComplex) {
            return [];
        }

        const values =
            collectIntervalRecordFieldValues(
                this.fieldInfo.view,
                this.selectionIntervalSource ?? this.selectionIntervalComplex,
                this.filterField
            ) ?? [];

        return Array.from(new Set(values.filter(isScalar))).map((value) => ({
            value,
            label: `${value}`,
            searchText: `${value}`.toLowerCase(),
        }));
    }
}

customElements.define(
    "gs-record-filtered-aggregation-dialog",
    RecordFilteredAggregationDialog
);

/**
 * @param {Object} params
 * @param {import("../selectionAggregationCandidates.js").SelectionAggregationFieldInfo} params.fieldInfo
 * @param {import("../types.js").Interval} params.selectionIntervalComplex
 * @param {import("../sampleViewTypes.js").SelectionIntervalSource} [params.selectionIntervalSource]
 * @param {import("../state/sampleState.js").SampleHierarchy} params.sampleHierarchy
 * @param {import("../compositeAttributeInfoSource.js").default} params.attributeInfoSource
 * @param {import("../types.js").AttributeIdentifierType} params.attributeType
 * @param {import("../sampleView.js").default} params.sampleView
 */
export async function showRecordFilteredAggregationDialog({
    fieldInfo,
    selectionIntervalComplex,
    selectionIntervalSource,
    sampleHierarchy,
    attributeInfoSource,
    attributeType,
    sampleView,
}) {
    const result = await showDialog(
        "gs-record-filtered-aggregation-dialog",
        (/** @type {RecordFilteredAggregationDialog} */ dialog) => {
            dialog.fieldInfo = fieldInfo;
            dialog.selectionIntervalComplex = selectionIntervalComplex;
            dialog.selectionIntervalSource = selectionIntervalSource ?? null;
            dialog.valueText = "";
            dialog.selectedValues = [];
        }
    );

    if (!result.ok) {
        return;
    }

    const config = /** @type {RecordFilteredAggregationConfig} */ (result.data);
    /** @type {import("../sampleViewTypes.js").IntervalSpecifier} */
    const specifier = {
        view: fieldInfo.viewSelector,
        field: fieldInfo.field,
        interval: selectionIntervalSource ?? selectionIntervalComplex,
        aggregation: { op: config.aggregation },
        recordFilter: config.recordFilter,
    };
    const attributeInfo = attributeInfoSource.getAttributeInfo({
        type: attributeType,
        specifier,
    });

    await handleAddToMetadata(attributeInfo, sampleHierarchy, sampleView);
}

/**
 * @param {unknown} value
 * @returns {value is import("@genome-spy/core/spec/channel.js").Scalar}
 */
function isScalar(value) {
    return (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    );
}
