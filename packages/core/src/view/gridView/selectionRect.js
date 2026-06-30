import { createGeneratedChromeOverlay } from "./generatedChromeOverlay.js";
import { createSelectionRectSpec } from "./selectionRectSpec.js";
import { createIntervalSelection } from "../../selection/selection.js";

export { INTERVAL_DRAG_ACTIVE_PARAM } from "./selectionRectSpec.js";

/**
 * @typedef {import("../../spec/channel.js").PrimaryPositionalChannel} PrimaryPositionalChannel
 * @typedef {import("./generatedChromeOverlay.js").GeneratedChromeOverlay} SelectionRectOverlay
 */

/**
 * Creates a generated chrome overlay for an interval selection rectangle.
 *
 * @param {{
 *     selectionExpr: import("../../paramRuntime/types.js").ExprRefFunction,
 *     selectionExpression: string,
 *     channels: PrimaryPositionalChannel[],
 *     brushConfig?: import("../../spec/parameter.js").BrushConfig,
 *     context: import("../../types/viewContext.js").default,
 *     layoutParent: import("../containerView.js").default,
 *     dataParent: import("../view.js").default,
 *     scaleResolutionSource: { getScaleResolution: (channel: PrimaryPositionalChannel) => import("../../scales/scaleResolution.js").default },
 *     name?: string,
 * }} options
 * @returns {SelectionRectOverlay}
 */
export function createSelectionRectOverlay({
    selectionExpr,
    selectionExpression,
    channels,
    brushConfig = {},
    context,
    layoutParent,
    dataParent,
    scaleResolutionSource,
    name = "selectionRect",
}) {
    const initialSelection =
        /** @type {import("../../types/selectionTypes.js").IntervalSelection} */ (
            selectionExpr() ?? createIntervalSelection(channels)
        );
    const { zindex = 1, ...brushMarkProps } = brushConfig;

    return createGeneratedChromeOverlay({
        spec: createSelectionRectSpec({
            scaleResolutionSource,
            selectionExpression,
            selection: initialSelection,
            channels,
            brushConfig: brushMarkProps,
        }),
        context,
        layoutParent,
        dataParent,
        name,
        zindex,
    });
}
