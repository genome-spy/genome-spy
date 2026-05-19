import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { html } from "lit";
import BaseDialog, { showDialog } from "../../components/generic/baseDialog.js";
import { handleAddToMetadata } from "./deriveMetadataFlow.js";

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
        aggregation: { state: true },
        filterField: { state: true },
        operator: { state: true },
        valueText: { state: true },
    };

    constructor() {
        super();

        /** @type {import("../selectionAggregationCandidates.js").SelectionAggregationFieldInfo | null} */
        this.fieldInfo = null;

        /** @type {import("../types.js").AggregationOp} */
        this.aggregation = "count";

        /** @type {string} */
        this.filterField = "";

        /** @type {import("../sampleViewTypes.js").RecordFilter["operator"]} */
        this.operator = "in";

        /** @type {string} */
        this.valueText = "";

        this.dialogTitle = "Filter records and aggregate";
    }

    /** @param {Map<string, any>} changed */
    willUpdate(changed) {
        if (changed.has("fieldInfo") && this.fieldInfo) {
            this.aggregation = this.fieldInfo.supportedAggregations.includes(
                "count"
            )
                ? "count"
                : this.fieldInfo.supportedAggregations[0];
            this.filterField = this.fieldInfo.filterableFields[0]?.field ?? "";
            this.operator = this.#isQuantitativeFilter() ? "gt" : "in";
        }
    }

    renderBody() {
        if (!this.fieldInfo) {
            throw new Error(
                "Record-filtered aggregation dialog is missing field info."
            );
        }

        return html`
            <div class="gs-form-group">
                <label for="recordFilterField">Record filter field</label>
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
                <label for="recordFilterOperator">Predicate</label>
                <div class="input-group">
                    <select
                        id="recordFilterOperator"
                        .value=${this.operator}
                        @change=${(/** @type {Event} */ event) =>
                            this.#operatorChanged(event)}
                    >
                        ${this.#operatorOptions().map(
                            ([operator, label]) => html`
                                <option value=${operator}>${label}</option>
                            `
                        )}
                    </select>
                    <input
                        autofocus
                        type=${this.#isQuantitativeFilter() &&
                        this.operator !== "in"
                            ? "number"
                            : "text"}
                        .value=${this.valueText}
                        placeholder=${this.operator === "in"
                            ? "value, another value"
                            : "value"}
                        @input=${(/** @type {Event} */ event) => {
                            this.valueText = /** @type {HTMLInputElement} */ (
                                event.target
                            ).value;
                        }}
                    />
                </div>
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
                        ? "Count records matching the filter."
                        : html`Aggregate
                              <em>${this.fieldInfo.field}</em> records matching
                              the filter.`}
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
    }

    /** @param {Event} event */
    #operatorChanged(event) {
        this.operator =
            /** @type {import("../sampleViewTypes.js").RecordFilter["operator"]} */ (
                /** @type {HTMLSelectElement} */ (event.target).value
            );
    }

    /**
     * @returns {Array<[import("../sampleViewTypes.js").RecordFilter["operator"], string]>}
     */
    #operatorOptions() {
        if (!this.#isQuantitativeFilter()) {
            return [["in", "is one of"]];
        }

        return [
            ["gt", ">"],
            ["gte", ">="],
            ["eq", "="],
            ["lte", "<="],
            ["lt", "<"],
        ];
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
        if (!this.filterField || this.valueText.trim().length === 0) {
            return false;
        }

        return (
            !this.#isQuantitativeFilter() || Number.isFinite(+this.valueText)
        );
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
        if (this.operator === "in") {
            return {
                field: this.filterField,
                operator: "in",
                values: this.valueText
                    .split(",")
                    .map((value) => value.trim())
                    .filter((value) => value.length > 0),
            };
        }

        if (this.operator === "eq" && !this.#isQuantitativeFilter()) {
            return {
                field: this.filterField,
                operator: "eq",
                value: this.valueText.trim(),
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
            dialog.valueText = "";
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
