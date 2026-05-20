import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faCaretLeft,
    faCaretRight,
    faInfoCircle,
    faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { css, html } from "lit";
import BaseDialog, { showDialog } from "../../components/generic/baseDialog.js";
import DialogWizardController from "../../components/generic/dialogWizardController.js";
import {
    formatAggregationFunctionName,
    formatAggregationLabel,
    formatFeatureFilterOperator,
    getAggregationOpInfo,
} from "../attributeAggregation/aggregationOps.js";
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
        aggregationFieldInfos: {},
        selectionIntervalComplex: {},
        selectionIntervalSource: {},
        aggregation: { state: true },
        aggregationField: { state: true },
        filterField: { state: true },
        operator: { state: true },
        valueText: { state: true },
        selectedValues: { state: true },
        _page: { state: true },
        _attributeInfo: { state: true },
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

            .expression-summary {
                margin-top: var(--gs-basic-spacing, 10px);
                padding: 0.5em 0.75em;
                background-color: #f6f6f6;
                border: var(--form-control-border);
                border-radius: var(--form-control-border-radius);
            }

            .expression-summary code {
                white-space: normal;
                overflow-wrap: anywhere;
            }
        `,
    ];

    /** @type {DialogWizardController} */
    #wizard;

    constructor() {
        super();

        /** @type {import("../selectionAggregationCandidates.js").SelectionAggregationFieldInfo | null} */
        this.fieldInfo = null;

        /** @type {import("../selectionAggregationCandidates.js").SelectionAggregationFieldInfo[]} */
        this.aggregationFieldInfos = [];

        /** @type {import("../types.js").Interval | null} */
        this.selectionIntervalComplex = null;

        /** @type {import("../sampleViewTypes.js").SelectionIntervalSource | null} */
        this.selectionIntervalSource = null;

        /** @type {import("../types.js").AggregationOp} */
        this.aggregation = "count";

        /** @type {string} */
        this.aggregationField = "";

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

        /** @type {any[] | null} */
        this._values = null;

        /** @type {string} */
        this._attributeName = "";

        /** @type {boolean} */
        this._metadataConfigHasErrors = false;

        this.dialogTitle = "Create sample metadata from features";

        this.#wizard = new DialogWizardController(this, [
            {
                render: () => this.#renderFeatureFilterPage(),
                canAdvance: () => this.#canContinue(),
                onAdvance: () => this.#prepareMetadataPage(),
            },
            {
                render: () => this.#renderMetadataPage(),
                canAdvance: () => !this._metadataConfigHasErrors,
                onAdvance: () => this.#finish(),
            },
        ]);
    }

    /** @param {Map<string, any>} changed */
    willUpdate(changed) {
        if (changed.has("fieldInfo") && this.fieldInfo) {
            this.dialogTitle = "Create sample metadata from features";
            this.aggregationField = this.fieldInfo.field;
            this.#normalizeAggregationForField();
            this.filterField = this.fieldInfo.filterableFields[0]?.field ?? "";
            this.operator = this.#isQuantitativeFilter() ? "gt" : "in";
            this.selectedValues = [];
        }
    }

    renderBody() {
        return this.#wizard.currentPage.render();
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
                <label for="featureFilterField">Filter field</label>
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
                <label>Filter condition</label>
                ${this.#isQuantitativeFilter()
                    ? this.#renderQuantitativePredicate()
                    : this.#renderCategoricalPredicate()}
            </div>

            <div class="gs-form-group">
                <label for="featureAggregationField">Aggregation field</label>
                <select
                    id="featureAggregationField"
                    .value=${this.aggregationField}
                    @change=${(/** @type {Event} */ event) => {
                        this.#aggregationFieldChanged(event);
                    }}
                >
                    ${this.#getAggregationFieldInfos().map(
                        (field) => html`
                            <option value=${field.field}>
                                ${field.field} (${field.type})
                            </option>
                        `
                    )}
                </select>
            </div>

            <div class="gs-form-group">
                <label for="featureAggregation">Aggregation operation</label>
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
                    ${this.#getSupportedAggregations().map(
                        (op) => html`
                            <option value=${op}>
                                ${getAggregationOpInfo(op).label}
                            </option>
                        `
                    )}
                </select>
                ${this.aggregation === "itemCount"
                    ? ""
                    : html`<small>Only non-null values are considered.</small>`}
            </div>

            ${this.#renderExpressionSummary()}
        `;
    }

    #renderMetadataPage() {
        if (!this._attributeInfo || !this._values || !this.sampleHierarchy) {
            throw new Error("Feature-filtered metadata page is missing data.");
        }

        return html`
            <gs-derived-metadata-configurator
                .attributeInfo=${this._attributeInfo}
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
        const isLastPage = this.#wizard.isLastPage;
        return [
            this.makeCloseButton("Cancel"),
            this.makeButton("Previous", () => this.#wizard.advance(-1), {
                iconDef: faCaretLeft,
                disabled: this.#wizard.isFirstPage,
            }),
            this.makeButton(
                isLastPage ? "Finish" : "Next",
                () => this.#wizard.advance(1),
                {
                    iconDef: isLastPage ? faPlus : faCaretRight,
                    isPrimary: true,
                    disabled: !this.#wizard.canAdvance(),
                }
            ),
        ];
    }

    /** @param {Event} event */
    #aggregationFieldChanged(event) {
        this.aggregationField = /** @type {HTMLSelectElement} */ (
            event.target
        ).value;
        this.#normalizeAggregationForField();
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
            <small>
                A feature matches when ${this.filterField} is any selected
                value.
            </small>
        `;
    }

    #renderInfoBox() {
        return html`
            <div class="gs-alert info">
                ${icon(faInfoCircle).node[0]}
                <div>
                    <p>
                        Create a new sample metadata attribute by filtering
                        features in the selected interval and aggregating the
                        result separately for each sample.
                    </p>
                </div>
            </div>
        `;
    }

    #renderExpressionSummary() {
        return html`
            <div class="expression-summary">
                Result:
                <code>${this.#formatAggregationPreview()}</code>
                per sample
            </div>
        `;
    }

    /**
     * @returns {string}
     */
    #formatAggregationPreview() {
        if (!this.fieldInfo) {
            return "";
        }

        const filterExpression = this.#formatFeatureFilterPreview();
        const field = this.aggregationField;
        if (this.aggregation === "itemCount") {
            return `${formatAggregationFunctionName(this.aggregation)}(where ${filterExpression})`;
        }

        if (this.aggregation === "count") {
            return `${formatAggregationFunctionName(this.aggregation)}(${field} where ${filterExpression})`;
        }

        return `${formatAggregationLabel(this.aggregation)}(${field} where ${filterExpression})`;
    }

    /**
     * @returns {string}
     */
    #formatFeatureFilterPreview() {
        if (this.#isQuantitativeFilter()) {
            return (
                this.filterField +
                " " +
                formatFeatureFilterOperator(this.operator) +
                " " +
                (this.valueText.trim() || "...")
            );
        }

        if (this.selectedValues.length === 0) {
            return this.filterField + " in {...}";
        }

        return (
            this.filterField +
            " in {" +
            this.selectedValues.map(String).join(", ") +
            "}"
        );
    }

    #isQuantitativeFilter() {
        return this.#filterFieldInfo()?.type === "quantitative";
    }

    #filterFieldInfo() {
        return this.fieldInfo?.filterableFields.find(
            (field) => field.field === this.filterField
        );
    }

    /**
     * @returns {import("../selectionAggregationCandidates.js").SelectionAggregationFieldInfo[]}
     */
    #getAggregationFieldInfos() {
        if (this.aggregationFieldInfos.length > 0) {
            return this.aggregationFieldInfos;
        }

        return this.fieldInfo ? [this.fieldInfo] : [];
    }

    /**
     * @returns {import("../selectionAggregationCandidates.js").SelectionAggregationFieldInfo | undefined}
     */
    #getAggregationFieldInfo() {
        return this.#getAggregationFieldInfos().find(
            (field) => field.field === this.aggregationField
        );
    }

    /**
     * @returns {import("../types.js").AggregationOp[]}
     */
    #getSupportedAggregations() {
        return this.#getAggregationFieldInfo()?.supportedAggregations ?? [];
    }

    #normalizeAggregationForField() {
        const supported = this.#getSupportedAggregations();
        if (!supported.includes(this.aggregation)) {
            this.aggregation = supported.includes("count")
                ? "count"
                : supported[0];
        }
    }

    #canContinue() {
        if (!this.filterField || !this.aggregationField) {
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
            field: this.aggregationField,
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

    resetWizard() {
        this.#wizard.reset();
        this._attributeInfo = null;
        this._values = null;
        this._attributeName = "";
        this._metadataConfigHasErrors = false;
    }
}

customElements.define(
    "gs-feature-filtered-aggregation-dialog",
    FeatureFilteredAggregationDialog
);

/**
 * @param {Object} params
 * @param {import("../selectionAggregationCandidates.js").SelectionAggregationFieldInfo} params.fieldInfo
 * @param {import("../selectionAggregationCandidates.js").SelectionAggregationFieldInfo[]} params.aggregationFieldInfos
 * @param {import("../types.js").Interval} params.selectionIntervalComplex
 * @param {import("../sampleViewTypes.js").SelectionIntervalSource} [params.selectionIntervalSource]
 * @param {import("../state/sampleState.js").SampleHierarchy} params.sampleHierarchy
 * @param {import("../compositeAttributeInfoSource.js").default} params.attributeInfoSource
 * @param {import("../types.js").AttributeIdentifierType} params.attributeType
 * @param {import("../sampleView.js").default} params.sampleView
 */
export async function showFeatureFilteredAggregationDialog({
    fieldInfo,
    aggregationFieldInfos,
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
            dialog.aggregationFieldInfos = aggregationFieldInfos;
            dialog.selectionIntervalComplex = selectionIntervalComplex;
            dialog.selectionIntervalSource = selectionIntervalSource ?? null;
            dialog.sampleHierarchy = sampleHierarchy;
            dialog.attributeInfoSource = attributeInfoSource;
            dialog.attributeType = attributeType;
            dialog.sampleView = sampleView;
            dialog.valueText = "";
            dialog.selectedValues = [];
            dialog.resetWizard();
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
