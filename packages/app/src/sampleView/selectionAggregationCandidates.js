import { isDiscrete } from "vega-scale";
import UnitView from "@genome-spy/core/view/unitView.js";
import { findEncodedFields } from "@genome-spy/core/view/viewUtils.js";
import {
    createViewRef,
    getUniqueViewRefKeys,
    getViewRefKey,
} from "./viewRef.js";
import { aggregationOps } from "./attributeAggregation/aggregationOps.js";

/** @type {import("./types.js").AggregationOp[]} */
const DEFAULT_AGGREGATIONS = ["count"];
/** @type {import("./types.js").AggregationOp[]} */
const QUANTITATIVE_AGGREGATIONS = aggregationOps.map((entry) => entry.op);

/**
 * Candidate field summary used by the interval aggregation UI and agent
 * context.
 */
/**
 * @typedef {Object} SelectionAggregationFieldSeed
 * @property {import("@genome-spy/core/view/unitView.js").default} view
 * @property {import("./sampleViewTypes.js").ViewSelector | undefined} [viewSelector]
 * @property {string | undefined} [viewTitle]
 * @property {import("@genome-spy/core/spec/channel.js").Channel} channel
 * @property {import("@genome-spy/core/spec/channel.js").Field} field
 * @property {import("@genome-spy/core/spec/channel.js").Type} type
 * @property {string | undefined} [description]
 * @property {import("./types.js").AggregationOp[] | undefined} [supportedAggregations]
 * @property {string | undefined} [candidateId]
 */
/**
 * @typedef {Object} SelectionAggregationFieldInfo
 * @property {import("@genome-spy/core/view/unitView.js").default} view
 * @property {import("./sampleViewTypes.js").ViewSelector} viewSelector
 * @property {string} viewTitle
 * @property {import("@genome-spy/core/spec/channel.js").Channel} channel
 * @property {import("@genome-spy/core/spec/channel.js").Field} field
 * @property {import("@genome-spy/core/spec/channel.js").Type} type
 * @property {string | undefined} description
 * @property {import("./types.js").AggregationOp[]} supportedAggregations
 * @property {string} candidateId
 */

/**
 * Returns the visible, addressable fields that can participate in interval
 * aggregation.
 *
 * @param {import("@genome-spy/core/view/view.js").default} view
 * @param {import("@genome-spy/core/view/view.js").default} layoutRoot
 * @param {boolean} hasInterval
 * @returns {SelectionAggregationFieldInfo[]}
 */
export function getSelectionAggregationFieldInfos(
    view,
    layoutRoot,
    hasInterval
) {
    const uniqueViewKeys = getUniqueViewRefKeys(layoutRoot);
    /** @type {SelectionAggregationFieldSeed[]} */
    let fieldInfos = getVisibleNonPositionalFieldInfos(view).filter((info) =>
        isAddressableView(info.view, uniqueViewKeys)
    );

    if (hasInterval) {
        try {
            /** @type {import("@genome-spy/core/view/unitView.js").default[]} */
            const unitViews = [];
            view.visit((child) => {
                if (
                    child instanceof UnitView &&
                    child.isVisible() &&
                    isAddressableView(child, uniqueViewKeys)
                ) {
                    unitViews.push(child);
                }
            });

            for (const unitView of unitViews) {
                const encoding = unitView.getEncoding();
                const hasXField = encoding?.x && "field" in encoding.x;
                const hasNonPositionalField = Object.entries(encoding).some(
                    ([channel, def]) =>
                        !["sample", "x", "x2"].includes(channel) &&
                        def &&
                        "field" in def
                );

                if (hasXField && !hasNonPositionalField) {
                    fieldInfos.push({
                        view: unitView,
                        viewSelector: createViewRef(unitView),
                        viewTitle: String(
                            unitView.getTitleText?.() ?? unitView.name
                        ),
                        channel: "x",
                        field: "Items",
                        type: "nominal",
                        description: undefined,
                        supportedAggregations: DEFAULT_AGGREGATIONS,
                        candidateId: createSelectionAggregationCandidateId(
                            createViewRef(unitView),
                            "Items"
                        ),
                    });
                }
            }
        } catch {
            // Partial stubs do not expose traversal helpers; skip the synthetic
            // item candidate in that case.
        }
    }

    if (!hasInterval) {
        fieldInfos = fieldInfos.filter(isPointQueryable);
    }

    return deduplicateFieldInfos(
        fieldInfos.map((info) => {
            const viewSelector = info.viewSelector ?? createViewRef(info.view);
            return {
                view: info.view,
                viewSelector,
                viewTitle:
                    info.viewTitle ??
                    String(info.view.getTitleText?.() ?? info.view.name),
                channel: info.channel,
                field: info.field,
                type: info.type,
                description: info.description,
                supportedAggregations:
                    info.supportedAggregations ??
                    getSupportedAggregations(info.type),
                candidateId:
                    info.candidateId ??
                    createSelectionAggregationCandidateId(
                        viewSelector,
                        info.field
                    ),
            };
        })
    );
}

/**
 * Backward-compatible alias for the current menu-driven field discovery helper.
 */
export const getContextMenuFieldInfos = getSelectionAggregationFieldInfos;

/**
 * Returns the visible views that do not expose point-queryable fields.
 *
 * @param {import("@genome-spy/core/view/view.js").default} view
 * @param {import("@genome-spy/core/view/view.js").default} layoutRoot
 * @returns {import("@genome-spy/core/view/unitView.js").default[]}
 */
export function getUnavailablePointQueryViews(view, layoutRoot) {
    const uniqueViewKeys = getUniqueViewRefKeys(layoutRoot);
    return Array.from(
        new Set(
            getVisibleNonPositionalFieldInfos(view)
                .filter((info) => !isAddressableView(info.view, uniqueViewKeys))
                .filter(isPointQueryable)
                .map((info) => info.view)
        )
    );
}

/**
 * @param {import("@genome-spy/core/view/view.js").default} view
 * @returns {SelectionAggregationFieldSeed[]}
 */
function getVisibleNonPositionalFieldInfos(view) {
    try {
        return findEncodedFields(view)
            .filter((info) => !["sample", "x", "x2"].includes(info.channel))
            .filter((info) => info.view.isVisible())
            .map((info) => ({
                ...info,
                description: getChannelDescription(
                    info.view,
                    info.channel,
                    info.field
                ),
            }));
    } catch {
        return getVisibleNonPositionalFieldInfosFromEncoding(view);
    }
}

/**
 * Lightweight fallback for tests and partial stubs.
 *
 * @param {import("@genome-spy/core/view/view.js").default} view
 * @returns {SelectionAggregationFieldSeed[]}
 */
function getVisibleNonPositionalFieldInfosFromEncoding(view) {
    const encoding = view.getEncoding?.();
    if (!encoding || typeof encoding !== "object") {
        return [];
    }

    /** @type {Array<{
     *   view: import("@genome-spy/core/view/unitView.js").default;
     *   channel: import("@genome-spy/core/spec/channel.js").Channel;
     *   field: import("@genome-spy/core/spec/channel.js").Field;
     *   type: import("@genome-spy/core/spec/channel.js").Type;
     *   description?: string;
     * }>} */
    const fieldInfos = [];

    for (const [channel, def] of Object.entries(encoding)) {
        if (
            ["sample", "x", "x2"].includes(channel) ||
            !def ||
            typeof def !== "object" ||
            !("field" in def) ||
            typeof def.field !== "string"
        ) {
            continue;
        }

        fieldInfos.push({
            view: /** @type {import("@genome-spy/core/view/unitView.js").default} */ (
                view
            ),
            channel:
                /** @type {import("@genome-spy/core/spec/channel.js").Channel} */ (
                    channel
                ),
            field: def.field,
            type:
                "type" in def && typeof def.type === "string"
                    ? def.type
                    : "nominal",
            description: getChannelDescription(view, channel, def.field),
        });
    }

    return fieldInfos;
}

/**
 * @param {import("@genome-spy/core/view/view.js").default} view
 * @param {import("@genome-spy/core/spec/channel.js").Channel} channel
 * @param {import("@genome-spy/core/spec/channel.js").Field} field
 * @returns {string | undefined}
 */
function getChannelDescription(view, channel, field) {
    const encoding = view.getEncoding();
    if (!encoding || typeof encoding !== "object") {
        return undefined;
    }

    const channelEncoding = encoding[channel];
    if (
        channelEncoding &&
        typeof channelEncoding === "object" &&
        "description" in channelEncoding
    ) {
        return channelEncoding.description;
    }

    for (const def of Object.values(encoding)) {
        if (
            !def ||
            typeof def !== "object" ||
            !("field" in def) ||
            def.field !== field
        ) {
            continue;
        }

        return def.description;
    }

    return undefined;
}

/**
 * @param {import("@genome-spy/core/view/view.js").default} view
 * @param {Set<string>} uniqueViewKeys
 * @returns {boolean}
 */
function isAddressableView(view, uniqueViewKeys) {
    const viewKey = getViewRefKey(view);
    return !!viewKey && uniqueViewKeys.has(viewKey);
}

/**
 * @param {{
 *   view: import("@genome-spy/core/view/unitView.js").default;
 *   channel: import("@genome-spy/core/spec/channel.js").Channel;
 *   field: import("@genome-spy/core/spec/channel.js").Field;
 *   type: import("@genome-spy/core/spec/channel.js").Type;
 * }} info
 * @returns {boolean}
 */
function isPointQueryable(info) {
    if (info.view.getEncoding()?.x2) {
        return true;
    }

    const scaleType = info.view.getScaleResolution("x")?.getScale()?.type;
    return scaleType ? isDiscrete(scaleType) : false;
}

/**
 * @param {string} dataType
 * @returns {import("./types.js").AggregationOp[]}
 */
function getSupportedAggregations(dataType) {
    return dataType === "quantitative"
        ? QUANTITATIVE_AGGREGATIONS
        : DEFAULT_AGGREGATIONS;
}

/**
 * @param {SelectionAggregationFieldInfo[]} fields
 * @returns {SelectionAggregationFieldInfo[]}
 */
function deduplicateFieldInfos(fields) {
    return Array.from(
        new Map(
            fields.map((fieldInfo) => [
                JSON.stringify([fieldInfo.viewSelector, fieldInfo.field]),
                fieldInfo,
            ])
        ).values()
    );
}

/**
 * @param {import("./sampleViewTypes.js").ViewSelector} viewSelector
 * @param {import("@genome-spy/core/spec/channel.js").Field} field
 * @returns {string}
 */
export function createSelectionAggregationCandidateId(viewSelector, field) {
    return (
        (viewSelector.scope.length > 0
            ? viewSelector.scope.join("/") + "/"
            : "") +
        viewSelector.view +
        ":" +
        field
    );
}
