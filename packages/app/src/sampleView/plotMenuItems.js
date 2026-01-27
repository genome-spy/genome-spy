import { DIVIDER } from "../utils/ui/contextMenu.js";
import showHierarchyBoxplotDialog from "../charts/hierarchyBoxplotDialog.js";
import showHierarchyScatterplotDialog from "../charts/hierarchyScatterplotDialog.js";

const SAMPLE_ATTRIBUTE = "SAMPLE_ATTRIBUTE";

/**
 * @param {import("../utils/ui/contextMenu.js").MenuItem[]} items
 * @param {import("./types.js").AttributeInfo} attributeInfo
 * @param {import("./sampleView.js").default} sampleView
 */
export function appendPlotMenuItems(items, attributeInfo, sampleView) {
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

    items.push(DIVIDER, {
        label: "Show a boxplot",
        callback: () => showHierarchyBoxplotDialog(attributeInfo, sampleView),
    });

    if (metadataAttributeInfos.length === 0) {
        return;
    }

    items.push({
        label: "Create a scatterplot",
        submenu: metadataAttributeInfos.map((info) => ({
            label: info.emphasizedName ?? info.name,
            callback: () =>
                showHierarchyScatterplotDialog(attributeInfo, info, sampleView),
        })),
    });
}
