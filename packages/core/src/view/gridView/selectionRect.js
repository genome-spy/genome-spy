import LayerView from "../layerView.js";
import { markGeneratedChromeOverlay } from "./generatedChromeOverlay.js";
import {
    createSelectionRectSpec,
    selectionToData,
} from "./selectionRectSpec.js";

export { INTERVAL_DRAG_ACTIVE_PARAM } from "./selectionRectSpec.js";

export default class SelectionRect extends LayerView {
    /**
     * @typedef {import("../../types/selectionTypes.js").IntervalSelection} IntervalSelection
     */

    /**
     * @param {import("./gridChild.js").default} gridChild
     * @param {import("../../paramRuntime/types.js").ExprRefFunction} selectionExpr
     * @param {import("../../spec/parameter.js").BrushConfig} [brushConfig]
     */
    constructor(gridChild, selectionExpr, brushConfig = {}) {
        const initialSelection = /** @type {IntervalSelection} */ (
            selectionExpr()
        );
        const { zindex = 1, ...brushMarkProps } = brushConfig;

        super(
            createSelectionRectSpec({
                gridChild,
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

        const selectionListener = () => {
            const selection =
                /** @type {import("../../types/selectionTypes.js").IntervalSelection} */ (
                    selectionExpr()
                );

            const datasource =
                /** @type {import("../../data/sources/inlineSource.js").default} */ (
                    this.flowHandle?.dataSource
                );

            if (!datasource) {
                throw new Error(
                    "Cannot find selection rect data source handle!"
                );
            }

            datasource.updateDynamicData(selectionToData(selection));
        };

        this.registerDisposer(selectionExpr.subscribe(selectionListener));
    }

    getZindex() {
        return this._zindex;
    }
}
