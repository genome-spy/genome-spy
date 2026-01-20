import { html } from "lit";
import { isChromosomalLocus } from "@genome-spy/core/genome/genome.js";
import { locusOrNumberToString } from "@genome-spy/core/genome/locusFormat.js";
import { selectionContainsPoint } from "@genome-spy/core/selection/selection.js";
import {
    findEncodedFields,
    findUniqueViewNames,
} from "@genome-spy/core/view/viewUtils.js";
import generateAttributeContextMenu from "./attributeContextMenu.js";
import { aggregationOps } from "./aggregationOps.js";
import { formatInterval } from "./intervalFormatting.js";

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
    const uniqueViewNames = findUniqueViewNames(layoutRoot);

    let fieldInfos = findEncodedFields(view)
        .filter((d) => !["sample", "x", "x2"].includes(d.channel))
        // TODO: Log a warning if the view name is not unique
        .filter((info) => uniqueViewNames.has(info.view.name));

    if (!hasInterval) {
        fieldInfos = fieldInfos.filter((info) => info.view.getEncoding()?.x2);
    }

    // The same field may be used on multiple channels.
    return Array.from(
        new Map(
            fieldInfos.map((info) => [
                JSON.stringify([info.view.name, info.field]),
                info,
            ])
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
    const availableOps =
        fieldInfo.type === "quantitative"
            ? aggregationOps
            : aggregationOps.filter((op) => op.op === "count");

    return [
        { label: "Interval aggregation", type: "header" },
        ...availableOps.map((op) => {
            /** @type {import("./sampleViewTypes.js").IntervalSpecifier} */
            const specifier = {
                view: fieldInfo.view.name,
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

            return {
                label: op.label,
                submenu: generateAttributeContextMenu(
                    html`Using ${op.label.toLowerCase()}(<em class="attribute"
                            >${fieldInfo.field}</em
                        >) over interval...`,
                    attributeInfo,
                    attributeValue,
                    sampleView
                ),
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
    /** @type {import("./sampleViewTypes.js").LocusSpecifier} */
    const specifier = {
        view: fieldInfo.view.name,
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

    return generateAttributeContextMenu(
        null,
        attributeInfo,
        // TODO: Get the value from data
        // But ability to remove undefined is useful too
        scalarX,
        sampleView
    );
}
