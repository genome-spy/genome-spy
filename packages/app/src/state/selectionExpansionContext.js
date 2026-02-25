import { getEncodingKeyFields } from "@genome-spy/core/encoder/metadataChannels.js";
import {
    asSelectionConfig,
    isPointSelectionConfig,
} from "@genome-spy/core/selection/selection.js";
import { field } from "@genome-spy/core/utils/field.js";
import {
    getParamSelector,
    getViewSelector,
    resolveParamSelector,
} from "@genome-spy/core/view/viewSelectors.js";

export const MULTIPLE_POINT_SELECTION_PARAMS_REASON =
    "multiplePointSelectionParams";

/**
 * @typedef {import("@genome-spy/core/view/unitView.js").default} UnitView
 * @typedef {import("@genome-spy/core/view/view.js").default} View
 * @typedef {import("@genome-spy/core/view/viewSelectors.js").ParamSelector} ParamSelector
 * @typedef {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} ViewSelector
 * @typedef {import("@genome-spy/core/data/flowNode.js").Datum} Datum
 * @typedef {import("@genome-spy/core/spec/channel.js").Scalar} Scalar
 * @typedef {import("./paramProvenanceTypes.d.ts").ExpandPointSelectionActionPayload} ExpandPointSelectionActionPayload
 *
 * @typedef {{ mark?: { unitView?: UnitView }, datum?: Datum }} SelectionExpansionHover
 *
 * @typedef {{
 *   hoveredView: UnitView,
 *   hoveredDatum: Datum,
 *   selector: ParamSelector,
 *   originViewSelector: ViewSelector,
 *   originKeyFields: string[],
 *   originKeyTuple: Scalar[],
 *   defaultPartitionBy: string[] | undefined,
 *   defaultScopeLabel: string
 * }} SelectionExpansionContext
 *
 * @typedef {{ label: string, payload: ExpandPointSelectionActionPayload }} SelectionExpansionOperationOption
 * @typedef {{ fieldName: string, valueLabel: string, operations: SelectionExpansionOperationOption[] }} SelectionExpansionFieldOption
 * @typedef {{ status: "available", context: SelectionExpansionContext } | { status: "disabled", reason: "multiplePointSelectionParams" } | { status: "unavailable" }} SelectionExpansionContextResolution
 */

/**
 * @param {View} rootView
 * @param {SelectionExpansionHover | undefined} hover
 * @returns {SelectionExpansionContextResolution}
 */
export function resolveSelectionExpansionContext(rootView, hover) {
    if (!hover || !hover.datum || !hover.mark?.unitView) {
        return { status: "unavailable" };
    }

    const hoveredView = hover.mark.unitView;
    const hoveredDatum = hover.datum;

    /** @type {string[]} */
    const pointParamNames = [];
    for (const [name, param] of hoveredView.paramRuntime.paramConfigs) {
        if (!("select" in param) || param.persist === false) {
            continue;
        }

        const select = asSelectionConfig(param.select);
        if (isPointSelectionConfig(select) && select.toggle) {
            pointParamNames.push(name);
        }
    }

    if (pointParamNames.length === 0) {
        return { status: "unavailable" };
    }

    if (pointParamNames.length > 1) {
        return {
            status: "disabled",
            reason: MULTIPLE_POINT_SELECTION_PARAMS_REASON,
        };
    }

    let keyFields;
    try {
        keyFields = getEncodingKeyFields(hoveredView.getEncoding());
    } catch (_error) {
        return { status: "unavailable" };
    }

    if (!keyFields || keyFields.length === 0) {
        return { status: "unavailable" };
    }

    const originKeyTuple = keyFields.map((keyField) =>
        field(keyField)(hoveredDatum)
    );
    if (originKeyTuple.some((value) => value == null)) {
        return { status: "unavailable" };
    }

    const paramName = pointParamNames[0];
    const selector = getParamSelector(hoveredView, paramName);

    try {
        resolveParamSelector(rootView, selector);
    } catch (_error) {
        return { status: "unavailable" };
    }

    let originViewSelector;
    try {
        originViewSelector = getViewSelector(hoveredView);
    } catch (_error) {
        return { status: "unavailable" };
    }

    /** @type {string[] | undefined} */
    let defaultPartitionBy;
    let defaultScopeLabel = "this scope";
    const sampleDef = hoveredView.getEncoding().sample;
    if (
        sampleDef &&
        !Array.isArray(sampleDef) &&
        typeof sampleDef.field === "string"
    ) {
        defaultPartitionBy = [sampleDef.field];
        defaultScopeLabel = "this sample";
    }

    return {
        status: "available",
        context: {
            hoveredView,
            hoveredDatum,
            selector,
            originViewSelector,
            originKeyFields: keyFields,
            originKeyTuple,
            defaultPartitionBy,
            defaultScopeLabel,
        },
    };
}

/**
 * @param {SelectionExpansionContext} context
 * @returns {SelectionExpansionFieldOption[]}
 */
export function createSelectionExpansionFieldOptions(context) {
    const {
        hoveredView,
        hoveredDatum,
        selector,
        originViewSelector,
        originKeyFields,
        originKeyTuple,
        defaultPartitionBy,
        defaultScopeLabel,
    } = context;

    const excludedFields = new Set([
        ...originKeyFields,
        ...(defaultPartitionBy ?? []),
    ]);

    const encodingFields = getEncodingReferencedFields(hoveredView);

    const preferredFields = getPreferredSelectionExpansionFields(
        hoveredView,
        hoveredDatum,
        excludedFields
    );

    const additionalFields = getFallbackSelectionExpansionFields(
        hoveredDatum,
        excludedFields
    ).filter((fieldName) => !encodingFields.has(fieldName));

    const scalarValueFields = [...preferredFields];
    for (const fieldName of additionalFields) {
        if (!scalarValueFields.includes(fieldName)) {
            scalarValueFields.push(fieldName);
        }
    }

    /** @type {SelectionExpansionFieldOption[]} */
    const options = [];
    for (const fieldName of scalarValueFields) {
        const value = hoveredDatum[fieldName];
        const valueLabel = formatSelectionExpansionValue(value);
        const currentScopeLabel = formatCurrentScopeLabel(defaultScopeLabel);
        const acrossAllLabel = formatAcrossAllLabel(defaultScopeLabel);
        const scopedActionLabel =
            fieldName + " equals " + valueLabel + " in " + currentScopeLabel;
        /** @type {SelectionExpansionOperationOption[]} */
        const operationOptions = [];
        operationOptions.push({
            label: "In " + currentScopeLabel,
            payload: {
                selector,
                operation: "replace",
                predicate: {
                    field: fieldName,
                    op: "eq",
                    valueFromField: fieldName,
                },
                partitionBy: defaultPartitionBy,
                origin: {
                    type: "datum",
                    view: originViewSelector,
                    keyFields: originKeyFields,
                    keyTuple: originKeyTuple,
                },
                label: scopedActionLabel,
            },
        });

        if (defaultPartitionBy?.length) {
            const globalActionLabel =
                fieldName + " equals " + valueLabel + " " + acrossAllLabel;
            operationOptions.push({
                label:
                    acrossAllLabel.charAt(0).toUpperCase() +
                    acrossAllLabel.slice(1),
                payload: {
                    selector,
                    operation: "replace",
                    predicate: {
                        field: fieldName,
                        op: "eq",
                        valueFromField: fieldName,
                    },
                    origin: {
                        type: "datum",
                        view: originViewSelector,
                        keyFields: originKeyFields,
                        keyTuple: originKeyTuple,
                    },
                    label: globalActionLabel,
                },
            });
        }

        options.push({
            fieldName,
            valueLabel,
            operations: operationOptions,
        });
    }

    return options;
}

/**
 * @param {UnitView} hoveredView
 * @returns {Set<string>}
 */
function getEncodingReferencedFields(hoveredView) {
    const encoding = hoveredView.getEncoding();
    const fields = new Set();

    /**
     * @param {unknown} channelDef
     */
    const collect = (channelDef) => {
        if (
            !channelDef ||
            typeof channelDef !== "object" ||
            Array.isArray(channelDef)
        ) {
            return;
        }

        /** @type {any} */
        const definition = channelDef;

        if (typeof definition.field === "string") {
            fields.add(definition.field);
        }

        if (typeof definition.chrom === "string") {
            fields.add(definition.chrom);
        }

        if (typeof definition.pos === "string") {
            fields.add(definition.pos);
        }

        if ("condition" in definition) {
            const { condition } = definition;
            if (Array.isArray(condition)) {
                for (const subCondition of condition) {
                    collect(subCondition);
                }
            } else {
                collect(condition);
            }
        }
    };

    for (const channelDef of Object.values(encoding)) {
        collect(channelDef);
    }

    return fields;
}

/**
 * @param {UnitView} hoveredView
 * @param {Datum} hoveredDatum
 * @param {Set<string>} excludedFields
 * @returns {string[]}
 */
function getPreferredSelectionExpansionFields(
    hoveredView,
    hoveredDatum,
    excludedFields
) {
    const encoding = hoveredView.getEncoding();
    /** @type {string[]} */
    const orderedFields = [];
    const seen = new Set();

    /**
     * @param {unknown} channelDef
     */
    const collectFromChannelDef = (channelDef) => {
        if (
            !channelDef ||
            typeof channelDef !== "object" ||
            Array.isArray(channelDef)
        ) {
            return;
        }

        /** @type {any} */
        const definition = channelDef;
        if (
            typeof definition.field === "string" &&
            (definition.type === "nominal" || definition.type === "ordinal") &&
            !seen.has(definition.field) &&
            isUsableSelectionExpansionField(
                definition.field,
                hoveredDatum,
                excludedFields
            )
        ) {
            seen.add(definition.field);
            orderedFields.push(definition.field);
        }

        if ("condition" in definition) {
            const { condition } = definition;
            if (Array.isArray(condition)) {
                for (const subCondition of condition) {
                    collectFromChannelDef(subCondition);
                }
            } else {
                collectFromChannelDef(condition);
            }
        }
    };

    for (const channelDef of Object.values(encoding)) {
        collectFromChannelDef(channelDef);
    }

    return orderedFields;
}

/**
 * @param {Datum} hoveredDatum
 * @param {Set<string>} excludedFields
 * @returns {string[]}
 */
function getFallbackSelectionExpansionFields(hoveredDatum, excludedFields) {
    return Object.keys(hoveredDatum).filter((fieldName) =>
        isUsableSelectionExpansionField(fieldName, hoveredDatum, excludedFields)
    );
}

/**
 * @param {string} fieldName
 * @param {Datum} hoveredDatum
 * @param {Set<string>} excludedFields
 * @returns {boolean}
 */
function isUsableSelectionExpansionField(
    fieldName,
    hoveredDatum,
    excludedFields
) {
    if (excludedFields.has(fieldName) || fieldName.startsWith("_")) {
        return false;
    }

    const value = hoveredDatum[fieldName];
    if (typeof value === "boolean") {
        return true;
    } else if (typeof value === "string") {
        return value.trim().length > 0;
    } else {
        return false;
    }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function formatSelectionExpansionValue(value) {
    const text = String(value);
    if (text.length > 20) {
        return text.slice(0, 17) + "...";
    }

    return text;
}

/**
 * @param {string} defaultScopeLabel
 * @returns {string}
 */
function formatCurrentScopeLabel(defaultScopeLabel) {
    if (defaultScopeLabel.startsWith("this ")) {
        return "current " + defaultScopeLabel.slice(5);
    }

    return defaultScopeLabel;
}

/**
 * @param {string} defaultScopeLabel
 * @returns {string}
 */
function formatAcrossAllLabel(defaultScopeLabel) {
    if (defaultScopeLabel === "this sample") {
        return "across all samples";
    }

    if (defaultScopeLabel === "this patient") {
        return "across all patients";
    }

    if (defaultScopeLabel === "this scope") {
        return "across all scopes";
    }

    return "across all";
}
