import { DIVIDER } from "../utils/ui/contextMenu.js";
import showHierarchyBoxplotDialog from "../charts/hierarchyBoxplotDialog.js";
import showHierarchyBarplotDialog from "../charts/hierarchyBarplotDialog.js";
import showHierarchyScatterplotDialog from "../charts/hierarchyScatterplotDialog.js";

const SAMPLE_ATTRIBUTE = "SAMPLE_ATTRIBUTE";

/**
 * @param {import("./sampleView.js").default} sampleView
 * @returns {string[] | undefined}
 */
function getGroupColorRange(sampleView) {
    if (sampleView.sampleHierarchy.groupMetadata.length !== 1) {
        return;
    }

    const attribute = sampleView.sampleHierarchy.groupMetadata[0].attribute;
    if (attribute.type !== SAMPLE_ATTRIBUTE) {
        return;
    }

    const attributeInfo =
        sampleView.compositeAttributeInfoSource.getAttributeInfo(attribute);
    if (attributeInfo.type === "quantitative") {
        return;
    }

    const scale = attributeInfo.scale;
    if (!scale || typeof scale.range !== "function") {
        return;
    }

    return scale.range();
}

/**
 * @param {import("../utils/ui/contextMenu.js").MenuItem[]} items
 * @param {import("./types.js").AttributeInfo} attributeInfo
 * @param {import("./sampleView.js").default} sampleView
 */
export function appendPlotMenuItems(items, attributeInfo, sampleView) {
    const isCategorical =
        attributeInfo.type === "nominal" || attributeInfo.type === "ordinal";

    if (isCategorical) {
        items.push(DIVIDER, {
            label: "Show bar plot...",
            callback: () =>
                showHierarchyBarplotDialog(
                    attributeInfo,
                    sampleView.sampleHierarchy,
                    sampleView.compositeAttributeInfoSource
                ),
        });
        return;
    }

    if (attributeInfo.type !== "quantitative") {
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

    items.push(DIVIDER, {
        label: "Show boxplot...",
        callback: () =>
            showHierarchyBoxplotDialog(
                attributeInfo,
                sampleView.sampleHierarchy,
                sampleView.compositeAttributeInfoSource
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
                    showHierarchyScatterplotDialog(
                        attributeInfo,
                        info,
                        sampleView.sampleHierarchy,
                        sampleView.compositeAttributeInfoSource,
                        groupColorRange
                    ),
            })),
        ],
    });
}
