import { DIVIDER } from "../utils/ui/contextMenu.js";
import showHierarchyBoxplotDialog from "../charts/hierarchyBoxplotDialog.js";

/**
 * @param {import("../utils/ui/contextMenu.js").MenuItem[]} items
 * @param {import("./types.js").AttributeInfo} attributeInfo
 * @param {import("./sampleView.js").default} sampleView
 */
export function appendPlotMenuItems(items, attributeInfo, sampleView) {
    if (attributeInfo.type !== "quantitative") {
        return;
    }

    items.push(DIVIDER, {
        label: "Show a boxplot",
        callback: () => showHierarchyBoxplotDialog(attributeInfo, sampleView),
    });
}
