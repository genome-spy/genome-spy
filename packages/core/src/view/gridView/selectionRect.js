import LayerView from "../layerView.js";
import { markGeneratedChromeOverlay } from "./generatedChromeOverlay.js";
import { createSelectionRectSpec } from "./selectionRectSpec.js";

export { INTERVAL_DRAG_ACTIVE_PARAM } from "./selectionRectSpec.js";

export default class SelectionRect extends LayerView {
    /**
     * @typedef {import("../../types/selectionTypes.js").IntervalSelection} IntervalSelection
     */

    /**
     * @param {import("./gridChild.js").default} gridChild
     * @param {import("../../paramRuntime/types.js").ExprRefFunction} selectionExpr
     * @param {import("../../spec/parameter.js").BrushConfig} [brushConfig]
     * @param {string} [selectionExpression]
     */
    constructor(
        gridChild,
        selectionExpr,
        brushConfig = {},
        selectionExpression = selectionExpr.code
    ) {
        const initialSelection = /** @type {IntervalSelection} */ (
            selectionExpr()
        );
        const { zindex = 1, ...brushMarkProps } = brushConfig;

        super(
            createSelectionRectSpec({
                gridChild,
                selectionExpression,
                selection: initialSelection,
                brushConfig: brushMarkProps,
            }),
            gridChild.layoutParent.context,
            gridChild.layoutParent,
            gridChild.view,
            "selectionRect" // TODO: Serial
        );

        /** @type {number} */
        this._zindex = zindex;

        markGeneratedChromeOverlay(this);
    }

    getZindex() {
        return this._zindex;
    }
}
