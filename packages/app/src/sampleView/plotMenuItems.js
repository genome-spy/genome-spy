import { DIVIDER } from "../utils/ui/contextMenu.js";
import { showPlotDialog } from "../charts/plotDialog.js";
import {
    buildHierarchyBarplot,
    buildHierarchyBoxplot,
    buildHierarchyScatterplot,
} from "../charts/hierarchySampleAttributePlots.js";
import { getGroupColorRange } from "../charts/sampleAttributePlotUtils.js";

const SAMPLE_ATTRIBUTE = "SAMPLE_ATTRIBUTE";

/**
 * @param {import("../utils/ui/contextMenu.js").MenuItem[]} items
 * @param {import("./types.js").AttributeInfo} attributeInfo
 * @param {import("./sampleView.js").default} sampleView
 * @param {{ includeDivider?: boolean }} [options]
 */
export function appendPlotMenuItems(
    items,
    attributeInfo,
    sampleView,
    options = {}
) {
    const { includeDivider = true } = options;
    const isCategorical =
        attributeInfo.type === "nominal" || attributeInfo.type === "ordinal";
    const isQuantitative = attributeInfo.type === "quantitative";

    if (!isCategorical && !isQuantitative) {
        return;
    }

    if (includeDivider) {
        items.push(DIVIDER);
    }

    if (isCategorical) {
        items.push({
            label: "Show bar plot...",
            callback: () =>
                showPlotDialog(
                    buildHierarchyBarplot({
                        attributeInfo,
                        sampleHierarchy: sampleView.sampleHierarchy,
                        attributeInfoSource:
                            sampleView.compositeAttributeInfoSource,
                    })
                ),
        });
        return;
    }

    if (!isQuantitative) {
        return;
    }

    const metadataAttributeInfos =
        sampleView.sampleHierarchy.sampleMetadata.attributeNames
            .map((name) =>
                sampleView.compositeAttributeInfoSource.getAttributeInfo({
                    type: SAMPLE_ATTRIBUTE,
                    specifier: name,
                })
            )
            .filter((info) => info.type === "quantitative");
    const groupColorRange = getGroupColorRange(sampleView);

    items.push({
        label: "Show boxplot...",
        callback: () =>
            showPlotDialog(
                buildHierarchyBoxplot({
                    attributeInfo,
                    sampleHierarchy: sampleView.sampleHierarchy,
                    attributeInfoSource:
                        sampleView.compositeAttributeInfoSource,
                })
            ),
    });

    if (metadataAttributeInfos.length === 0) {
        return;
    }

    items.push({
        label: "Create scatterplot against...",
        submenu: [
            { label: "Choose the secondary attribute", type: "header" },
            ...metadataAttributeInfos.map((info) => ({
                label: info.emphasizedName,
                callback: () =>
                    showPlotDialog(
                        buildHierarchyScatterplot({
                            xAttributeInfo: attributeInfo,
                            yAttributeInfo: info,
                            sampleHierarchy: sampleView.sampleHierarchy,
                            attributeInfoSource:
                                sampleView.compositeAttributeInfoSource,
                            colorScaleRange: groupColorRange,
                        })
                    ),
            })),
        ],
    });
}
