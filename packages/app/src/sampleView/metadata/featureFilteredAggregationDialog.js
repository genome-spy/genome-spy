import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faCaretLeft,
    faCaretRight,
    faExclamationCircle,
    faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { css, html } from "lit";
import BaseDialog, { showDialog } from "../../components/generic/baseDialog.js";
import { formatAggregationLabel } from "../attributeAggregation/aggregationOps.js";
import {
    buildDerivedMetadataIntent,
    createDerivedAttributeName,
} from "./deriveMetadataUtils.js";
import { collectIntervalFeatureFieldValues } from "../selectionFeatureFieldValues.js";
import "./derivedMetadataConfigurator.js";
import "../../components/generic/comparisonOperatorButtons.js";
import "../../components/generic/searchableCheckboxList.js";

class FeatureFilteredAggregationDialog extends BaseDialog {
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
        _page: { state: true },
        _attributeInfo: { state: true },
        _sampleIds: { state: true },
        _values: { state: true },
        _attributeName: { state: true },
        _metadataConfigHasErrors: { state: true },
    };

    static styles = [
        ...super.styles,
        css`
            dialog {
                width: 560px;
            }
        `,
    ];

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

        /** @type {import("../sampleViewTypes.js").FeatureFilter["operator"]} */
        this.operator = "in";

        /** @type {string} */
        this.valueText = "";

        /** @type {import("@genome-spy/core/spec/channel.js").Scalar[]} */
        this.selectedValues = [];

        /** @type {import("../state/sampleState.js").SampleHierarchy | null} */
        this.sampleHierarchy = null;

        /** @type {import("../compositeAttributeInfoSource.js").default | null} */
        this.attributeInfoSource = null;

        /** @type {import("../types.js").AttributeIdentifierType | null} */
        this.attributeType = null;

        /** @type {import("../sampleView.js").default | null} */
        this.sampleView = null;

        this._page = 0;

        /** @type {import("../types.js").AttributeInfo | null} */
        this._attributeInfo = null;

        /** @type {string[] | null} */
        this._sampleIds = null;

        /** @type {any[] | null} */
        this._values = null;

        /** @type {string} */
        this._attributeName = "";

        /** @type {boolean} */
        this._metadataConfigHasErrors = false;

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
        if (this._page === 1) {
            return this.#renderMetadataPage();
        }

        return this.#renderFeatureFilterPage();
    }

    #renderFeatureFilterPage() {
        if (!this.fieldInfo) {
            throw new Error(
                "Feature-filtered aggregation dialog is missing field info."
            );
        }

        return html`
            ${this.#renderInfoBox()}

            <div class="gs-form-group">
                <label for="featureFilterField">Feature filter field</label>
                <select
                    id="featureFilterField"
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
                <label for="featureAggregation">Aggregation</label>
                <select
                    id="featureAggregation"
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

    #renderMetadataPage() {
        if (
            !this._attributeInfo ||
            !this._sampleIds ||
            !this._values ||
            !this.sampleHierarchy
        ) {
            throw new Error("Feature-filtered metadata page is missing data.");
        }

        return html`
            <gs-derived-metadata-configurator
                .attributeInfo=${this._attributeInfo}
                .sampleIds=${this._sampleIds}
                .values=${this._values}
                .existingAttributeNames=${this.sampleHierarchy.sampleMetadata
                    .attributeNames}
                .attributeName=${this._attributeName}
                @metadata-config-validity-change=${(
                    /** @type {CustomEvent<{ hasErrors: boolean }>} */ event
                ) => {
                    this._metadataConfigHasErrors = event.detail.hasErrors;
                }}
            ></gs-derived-metadata-configurator>
        `;
    }

    renderButtons() {
        const isLastPage = this._page === 1;
        return [
            this.makeCloseButton("Cancel"),
            this.makeButton("Previous", () => this.#changePage(-1), {
                iconDef: faCaretLeft,
                disabled: this._page === 0,
            }),
            this.makeButton(
                isLastPage ? "Finish" : "Next",
                () => this.#changePage(1),
                {
                    iconDef: isLastPage ? faPlus : faCaretRight,
                    isPrimary: true,
                    disabled: !this.#canAdvancePage(),
                }
            ),
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
                        Next lets you name the new metadata attribute and
                        configure its scale.
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

    /**
     * @param {-1 | 1} direction
     */
    #changePage(direction) {
        if (direction < 0) {
            this._page = 0;
            return true;
        }

        if (this._page === 0) {
            if (!this.#prepareMetadataPage()) {
                return true;
            }

            this._page = 1;
            return true;
        }

        return this.#finish();
    }

    /**
     * @returns {import("../sampleViewTypes.js").FeatureFilter}
     */
    #createFeatureFilter() {
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

    #prepareMetadataPage() {
        if (
            !this.fieldInfo ||
            !this.sampleHierarchy ||
            !this.attributeInfoSource ||
            !this.attributeType
        ) {
            throw new Error(
                "Feature-filtered aggregation wizard is missing required data."
            );
        }

        if (!this.sampleHierarchy.sampleData) {
            throw new Error("Sample data has not been initialized.");
        }

        /** @type {import("../sampleViewTypes.js").IntervalSpecifier} */
        const specifier = {
            view: this.fieldInfo.viewSelector,
            field: this.fieldInfo.field,
            interval:
                this.selectionIntervalSource ?? this.selectionIntervalComplex,
            aggregation: { op: this.aggregation },
            featureFilter: this.#createFeatureFilter(),
        };
        const attributeInfo = this.attributeInfoSource.getAttributeInfo({
            type: this.attributeType,
            specifier,
        });
        const sampleIds = this.sampleHierarchy.sampleData.ids;
        const values = attributeInfo.valuesProvider({
            sampleIds,
            sampleHierarchy: this.sampleHierarchy,
        });

        if (values.length !== sampleIds.length) {
            throw new Error(
                "Derived metadata values length does not match sample ids."
            );
        }

        this._attributeInfo = attributeInfo;
        this._sampleIds = sampleIds;
        this._values = values;
        this._attributeName = createDerivedAttributeName(
            attributeInfo,
            this.sampleHierarchy.sampleMetadata.attributeNames
        );
        this._metadataConfigHasErrors = false;
        return true;
    }

    #finish() {
        if (!this._attributeInfo || !this.sampleView) {
            throw new Error(
                "Feature-filtered aggregation wizard is missing derived data."
            );
        }

        const config = this.#metadataConfigurator()?.getConfig();
        if (!config) {
            return true;
        }

        this.sampleView.intentExecutor.dispatch(
            this.sampleView.actions.deriveMetadata(
                buildDerivedMetadataIntent(
                    this._attributeInfo.attribute,
                    config
                )
            )
        );
        this.finish({ ok: true });
        return false;
    }

    #canAdvancePage() {
        if (this._page === 0) {
            return this.#canContinue();
        }

        return !this._metadataConfigHasErrors;
    }

    /**
     * @returns {import("./derivedMetadataConfigurator.js").default | null}
     */
    #metadataConfigurator() {
        return this.renderRoot.querySelector(
            "gs-derived-metadata-configurator"
        );
    }

    /**
     * @returns {import("../../components/generic/searchableCheckboxList.js").SearchableCheckboxListItem[]}
     */
    #getCategoryItems() {
        if (!this.fieldInfo || !this.selectionIntervalComplex) {
            return [];
        }

        const values =
            collectIntervalFeatureFieldValues(
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
    "gs-feature-filtered-aggregation-dialog",
    FeatureFilteredAggregationDialog
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
export async function showFeatureFilteredAggregationDialog({
    fieldInfo,
    selectionIntervalComplex,
    selectionIntervalSource,
    sampleHierarchy,
    attributeInfoSource,
    attributeType,
    sampleView,
}) {
    await showDialog(
        "gs-feature-filtered-aggregation-dialog",
        (/** @type {FeatureFilteredAggregationDialog} */ dialog) => {
            dialog.fieldInfo = fieldInfo;
            dialog.selectionIntervalComplex = selectionIntervalComplex;
            dialog.selectionIntervalSource = selectionIntervalSource ?? null;
            dialog.sampleHierarchy = sampleHierarchy;
            dialog.attributeInfoSource = attributeInfoSource;
            dialog.attributeType = attributeType;
            dialog.sampleView = sampleView;
            dialog.valueText = "";
            dialog.selectedValues = [];
            dialog._page = 0;
            dialog._attributeInfo = null;
            dialog._sampleIds = null;
            dialog._values = null;
            dialog._attributeName = "";
            dialog._metadataConfigHasErrors = false;
        }
    );
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
