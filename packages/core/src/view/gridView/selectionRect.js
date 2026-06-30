import { createGeneratedChromeOverlay } from "./generatedChromeOverlay.js";
import { createSelectionRectSpec } from "./selectionRectSpec.js";

export { INTERVAL_DRAG_ACTIVE_PARAM } from "./selectionRectSpec.js";

/**
 * @typedef {import("./generatedChromeOverlay.js").GeneratedChromeOverlay} SelectionRectOverlay
 */

/**
 * Creates a generated chrome overlay for an interval selection rectangle.
 *
 * @param {{
 *     gridChild: import("./gridChild.js").default,
 *     selectionExpr: import("../../paramRuntime/types.js").ExprRefFunction,
 *     selectionExpression: string,
 *     brushConfig?: import("../../spec/parameter.js").BrushConfig,
 * }} options
 * @returns {SelectionRectOverlay}
 */
export function createSelectionRectOverlay({
    gridChild,
    selectionExpr,
    selectionExpression,
    brushConfig = {},
}) {
    const initialSelection =
        /** @type {import("../../types/selectionTypes.js").IntervalSelection} */ (
            selectionExpr()
        );
    const { zindex = 1, ...brushMarkProps } = brushConfig;

    return createGeneratedChromeOverlay({
        spec: createSelectionRectSpec({
            gridChild,
            selectionExpression,
            selection: initialSelection,
            brushConfig: brushMarkProps,
        }),
        context: gridChild.layoutParent.context,
        layoutParent: gridChild.layoutParent,
        dataParent: gridChild.view,
        name: "selectionRect", // TODO: Serial
        zindex,
    });
}
