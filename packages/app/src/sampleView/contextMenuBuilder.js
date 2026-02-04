import { html } from "lit";
import { isChromosomalLocus } from "@genome-spy/core/genome/genome.js";
import { locusOrNumberToString } from "@genome-spy/core/genome/locusFormat.js";
import { selectionContainsPoint } from "@genome-spy/core/selection/selection.js";
import UnitView from "@genome-spy/core/view/unitView.js";
import { findEncodedFields } from "@genome-spy/core/view/viewUtils.js";
import { DIVIDER } from "../utils/ui/contextMenu.js";
import generateAttributeContextMenu from "./attributeContextMenu.js";
import { aggregationOps } from "./attributeAggregation/aggregationOps.js";
import { formatInterval } from "./attributeAggregation/intervalFormatting.js";
import { appendPlotMenuItems } from "./plotMenuItems.js";
import { handleAddToMetadata } from "./metadata/deriveMetadataFlow.js";
import {
    createViewRef,
    getUniqueViewRefKeys,
    getViewRefKey,
} from "./viewRef.js";

const SAMPLE_ATTRIBUTE = "SAMPLE_ATTRIBUTE";

/**
 * @typedef {Object} FieldInfo
 * @property {import("@genome-spy/core/view/unitView.js").default} view
 * @property {import("@genome-spy/core/spec/channel.js").Channel} channel
 * @property {import("@genome-spy/core/spec/channel.js").Field} field
 * @property {import("@genome-spy/core/spec/channel.js").Type} type
 */

/**
 * @param {import("@genome-spy/core/view/view.js").default} view
 * @param {import("@genome-spy/core/scales/scaleResolution.js").default} resolution
 * @param {import("@genome-spy/core/spec/channel.js").Scalar | import("@genome-spy/core/spec/genome.js").ChromosomalLocus} complexX
 * @returns {string}
 */
export function formatPointContextLabel(view, resolution, complexX) {
    const axisTitle = view.getAxisResolution("x")?.getTitle();
    return resolution.type === "locus"
        ? "Locus: " +
              (isChromosomalLocus(complexX) || typeof complexX === "number"
                  ? locusOrNumberToString(complexX)
                  : String(complexX))
        : (axisTitle ? axisTitle + ": " : "") + complexX;
}

/**
 * @param {{ selection: import("@genome-spy/core/types/selectionTypes.js").IntervalSelection, view: import("@genome-spy/core/view/view.js").default }} [selectionInfo]
 * @param {Partial<Record<"x" | "y", number>>} [selectionPoint]
 * @returns {{
 *  selectionInterval?: [number, number],
 *  selectionIntervalComplex?: import("./types.js").Interval,
 *  selectionIntervalLabel?: string,
 * }}
 */
export function resolveIntervalSelection(selectionInfo, selectionPoint) {
    if (
        !selectionInfo ||
        !selectionPoint ||
        selectionInfo.selection.intervals.x?.length !== 2 ||
        !selectionContainsPoint(selectionInfo.selection, selectionPoint)
    ) {
        return {};
    }

    const selectionInterval = /** @type {[number, number]} */ (
        selectionInfo.selection.intervals.x
    );
    const selectionIntervalComplex =
        selectionInfo.view.getScaleResolution("x")?.type === "locus"
            ? /** @type {import("./types.js").Interval} */ ([
                  selectionInfo.view
                      .getScaleResolution("x")
                      .toComplex(selectionInterval[0]),
                  selectionInfo.view
                      .getScaleResolution("x")
                      .toComplex(selectionInterval[1]),
              ])
            : /** @type {import("./types.js").Interval} */ (selectionInterval);

    return {
        selectionInterval,
        selectionIntervalComplex,
        selectionIntervalLabel: formatInterval(
            selectionInfo.view,
            selectionIntervalComplex
        ),
    };
}

/**
 * @param {import("@genome-spy/core/view/view.js").default} view
 * @param {import("@genome-spy/core/view/view.js").default} layoutRoot
 * @param {boolean} hasInterval
 * @returns {FieldInfo[]}
 */
export function getContextMenuFieldInfos(view, layoutRoot, hasInterval) {
    const uniqueViewKeys = getUniqueViewRefKeys(layoutRoot);

    /** @type {import("@genome-spy/core/view/unitView.js").default[]} */
    const unitViews = [];
    view.visit((child) => {
        if (child instanceof UnitView) {
            unitViews.push(child);
        }
    });

    let fieldInfos = findEncodedFields(view)
        .filter((d) => !["sample", "x", "x2"].includes(d.channel))
        // TODO: Log a warning if the view reference is not unique.
        .filter((info) => {
            const viewKey = getViewRefKey(info.view);
            return viewKey && uniqueViewKeys.has(viewKey);
        })
        .filter((info) => info.view.isVisible());

    if (hasInterval) {
        for (const unitView of unitViews) {
            if (!unitView.isVisible()) {
                continue;
            }

            const viewKey = getViewRefKey(unitView);
            if (!viewKey || !uniqueViewKeys.has(viewKey)) {
                continue;
            }

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
                    channel: "x",
                    field: "Items",
                    type: "nominal",
                });
            }
        }
    }

    if (!hasInterval) {
        fieldInfos = fieldInfos.filter((info) => info.view.getEncoding()?.x2);
    }

    // The same field may be used on multiple channels.
    return Array.from(
        new Map(
            fieldInfos.map((info) => {
                const viewKey = getViewRefKey(info.view);
                return [
                    JSON.stringify([viewKey ?? info.view.name, info.field]),
                    info,
                ];
            })
        ).values()
    );
}

/**
 * @param {Object} params
 * @param {FieldInfo} params.fieldInfo
 * @param {import("./types.js").Interval} params.selectionIntervalComplex
 * @param {import("./state/sampleState.js").Sample} params.sample
 * @param {import("./state/sampleState.js").SampleHierarchy} params.sampleHierarchy
 * @param {import("./compositeAttributeInfoSource.js").default} params.attributeInfoSource
 * @param {string} params.attributeType
 * @param {import("./sampleView.js").default} params.sampleView
 * @returns {import("../utils/ui/contextMenu.js").MenuItem[]}
 */
export function buildIntervalAggregationMenu({
    fieldInfo,
    selectionIntervalComplex,
    sample,
    sampleHierarchy,
    attributeInfoSource,
    attributeType,
    sampleView,
}) {
    const viewRef = createViewRef(fieldInfo.view);
    const availableOps =
        fieldInfo.type === "quantitative"
            ? aggregationOps
            : aggregationOps.filter((op) => op.op === "count");

    return [
        { label: "Interval aggregation", type: "header" },
        ...availableOps.map((op) => {
            const opLabel = op.op === "count" ? "Item count" : op.label;
            const menuTitle =
                op.op === "count"
                    ? "Using item count over interval..."
                    : html`Using ${op.label.toLowerCase()}(<em class="attribute"
                              >${fieldInfo.field}</em
                          >) over interval...`;

            /** @type {import("./sampleViewTypes.js").IntervalSpecifier} */
            const specifier = {
                view: viewRef,
                field: fieldInfo.field,
                interval: selectionIntervalComplex,
                aggregation: { op: op.op },
            };

            const attributeInfo = attributeInfoSource.getAttributeInfo({
                type: attributeType,
                specifier,
            });
            const attributeValue = sample
                ? attributeInfo.accessor(sample.id, sampleHierarchy)
                : undefined;

            const submenuItems = generateAttributeContextMenu(
                menuTitle,
                attributeInfo,
                attributeValue,
                sampleView
            );
            appendDerivedAndPlotMenuItems(
                submenuItems,
                attributeInfo,
                sampleHierarchy,
                sampleView
            );

            return {
                label: opLabel,
                submenu: submenuItems,
            };
        }),
    ];
}

/**
 * @param {Object} params
 * @param {FieldInfo} params.fieldInfo
 * @param {import("@genome-spy/core/spec/channel.js").Scalar | import("@genome-spy/core/spec/genome.js").ChromosomalLocus} params.complexX
 * @param {import("./state/sampleState.js").Sample} params.sample
 * @param {import("./state/sampleState.js").SampleHierarchy} params.sampleHierarchy
 * @param {import("./compositeAttributeInfoSource.js").default} params.attributeInfoSource
 * @param {string} params.attributeType
 * @param {import("./sampleView.js").default} params.sampleView
 * @returns {import("../utils/ui/contextMenu.js").MenuItem[]}
 */
export function buildPointQueryMenu({
    fieldInfo,
    complexX,
    sample,
    sampleHierarchy,
    attributeInfoSource,
    attributeType,
    sampleView,
}) {
    const viewRef = createViewRef(fieldInfo.view);
    /** @type {import("./sampleViewTypes.js").LocusSpecifier} */
    const specifier = {
        view: viewRef,
        field: fieldInfo.field,
        locus: complexX,
    };

    const attributeInfo = attributeInfoSource.getAttributeInfo({
        type: attributeType,
        specifier,
    });

    const scalarX = sample
        ? attributeInfo.accessor(sample.id, sampleHierarchy)
        : undefined;

    const items = generateAttributeContextMenu(
        null,
        attributeInfo,
        // TODO: Get the value from data
        // But ability to remove undefined is useful too
        scalarX,
        sampleView
    );
    appendDerivedAndPlotMenuItems(
        items,
        attributeInfo,
        sampleHierarchy,
        sampleView
    );

    return items;
}

/**
 * @param {import("../utils/ui/contextMenu.js").MenuItem[]} items
 * @param {import("./types.js").AttributeInfo} attributeInfo
 * @param {import("./state/sampleState.js").SampleHierarchy} sampleHierarchy
 * @param {import("./sampleView.js").default} sampleView
 */
function appendAddToMetadataMenuItem(
    items,
    attributeInfo,
    sampleHierarchy,
    sampleView
) {
    if (!sampleHierarchy.sampleData) {
        throw new Error("Sample data has not been initialized.");
    }

    if (attributeInfo.attribute.type === SAMPLE_ATTRIBUTE) {
        return;
    }

    items.push({
        label: "Add to sample metadata...",
        callback: () => {
            void handleAddToMetadata(
                attributeInfo,
                sampleHierarchy,
                sampleView
            );
        },
    });
}

/**
 * @param {import("../utils/ui/contextMenu.js").MenuItem[]} items
 * @param {import("./types.js").AttributeInfo} attributeInfo
 * @param {import("./state/sampleState.js").SampleHierarchy} sampleHierarchy
 * @param {import("./sampleView.js").default} sampleView
 */
function appendDerivedAndPlotMenuItems(
    items,
    attributeInfo,
    sampleHierarchy,
    sampleView
) {
    const canAddToMetadata = attributeInfo.attribute.type !== SAMPLE_ATTRIBUTE;
    const hasPlots =
        attributeInfo.type === "quantitative" ||
        attributeInfo.type === "nominal" ||
        attributeInfo.type === "ordinal";

    if (!canAddToMetadata && !hasPlots) {
        return;
    }

    items.push(DIVIDER);
    appendAddToMetadataMenuItem(
        items,
        attributeInfo,
        sampleHierarchy,
        sampleView
    );
    appendPlotMenuItems(items, attributeInfo, sampleView, {
        includeDivider: false,
    });
}

/**
 * @param {import("./types.js").AttributeInfo} attributeInfo
 * @param {import("./state/sampleState.js").SampleHierarchy} sampleHierarchy
 * @param {import("./sampleView.js").default} sampleView
 */
