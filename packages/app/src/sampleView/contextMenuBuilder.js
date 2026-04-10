import { html } from "lit";
import { isChromosomalLocus } from "@genome-spy/core/genome/genome.js";
import { locusOrNumberToString } from "@genome-spy/core/genome/locusFormat.js";
import { selectionContainsPoint } from "@genome-spy/core/selection/selection.js";
import { DIVIDER } from "../utils/ui/contextMenu.js";
import generateAttributeContextMenu from "./attributeContextMenu.js";
import { getAggregationOpInfo } from "./attributeAggregation/aggregationOps.js";
import { formatInterval } from "./attributeAggregation/intervalFormatting.js";
import { appendPlotMenuItems } from "./plotMenuItems.js";
import { handleAddToMetadata } from "./metadata/deriveMetadataFlow.js";
import {
    getContextMenuFieldInfos,
    getUnavailablePointQueryViews,
} from "./selectionAggregationCandidates.js";

export { getContextMenuFieldInfos, getUnavailablePointQueryViews };

const SAMPLE_ATTRIBUTE = "SAMPLE_ATTRIBUTE";

/**
 * @typedef {import("./selectionAggregationCandidates.js").SelectionAggregationFieldInfo} FieldInfo
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
/**
 * @param {Object} params
 * @param {FieldInfo} params.fieldInfo
 * @param {import("./types.js").Interval} params.selectionIntervalComplex
 * @param {import("./sampleViewTypes.js").SelectionIntervalSource} [params.selectionIntervalSource]
 * @param {import("./state/sampleState.js").Sample} params.sample
 * @param {import("./state/sampleState.js").SampleHierarchy} params.sampleHierarchy
 * @param {import("./compositeAttributeInfoSource.js").default} params.attributeInfoSource
 * @param {import("./types.js").AttributeIdentifierType} params.attributeType
 * @param {import("./sampleView.js").default} params.sampleView
 * @returns {import("../utils/ui/contextMenu.js").MenuItem[]}
 */
export function buildIntervalAggregationMenu({
    fieldInfo,
    selectionIntervalComplex,
    selectionIntervalSource,
    sample,
    sampleHierarchy,
    attributeInfoSource,
    attributeType,
    sampleView,
}) {
    return [
        { label: "Interval aggregation", type: "header" },
        ...fieldInfo.supportedAggregations.map((op) => {
            const opInfo = getAggregationOpInfo(op);
            const opLabel = op === "count" ? "Item count" : opInfo.label;
            const menuTitle =
                op === "count"
                    ? "Using item count over interval..."
                    : html`Using ${opInfo.label.toLowerCase()}(<em
                              class="attribute"
                              >${fieldInfo.field}</em
                          >) over interval...`;

            /** @type {import("./sampleViewTypes.js").IntervalSpecifier} */
            const specifier = selectionIntervalSource
                ? {
                      view: fieldInfo.viewSelector,
                      field: fieldInfo.field,
                      interval: selectionIntervalSource,
                      aggregation: { op },
                  }
                : {
                      view: fieldInfo.viewSelector,
                      field: fieldInfo.field,
                      interval: selectionIntervalComplex,
                      aggregation: { op },
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
 * @param {import("./types.js").AttributeIdentifierType} params.attributeType
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
    /** @type {import("./sampleViewTypes.js").LocusSpecifier} */
    const specifier = {
        view: fieldInfo.viewSelector,
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
