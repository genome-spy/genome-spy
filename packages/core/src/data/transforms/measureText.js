import { BEHAVIOR_MODIFIES } from "../flowNode.js";
import { field } from "../../utils/field.js";
import Transform from "./transform.js";
import { isExprRef } from "../../paramRuntime/paramUtils.js";

/**
 * Measures text length. This is mainly intended for strand arrows in gene annotations.
 */
export default class MeasureTextTransform extends Transform {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     *
     * @param {import("../../spec/transform.js").MeasureTextParams} params
     * @param {import("../flowNode.js").ParamRuntimeProvider} paramRuntimeProvider
     */
    constructor(params, paramRuntimeProvider) {
        super(params, paramRuntimeProvider);

        this.params = params;

        const accessor = field(params.field);
        const as = params.as;

        let size = 0;

        // TODO: Refactor this into reusable code.
        if (isExprRef(params.fontSize)) {
            const sizeExpr = paramRuntimeProvider.paramRuntime.watchExpression(
                params.fontSize.expr,
                () => {
                    size = sizeExpr();
                    this.repropagate();
                },
                {
                    scopeOwned: false,
                    registerDisposer: (disposer) =>
                        this.registerDisposer(disposer),
                }
            );
            size = sizeExpr();
        } else {
            size = params.fontSize;
        }

        /**
         *
         * @param {any} datum
         */
        this.handle = (datum) => {
            const text = accessor(datum);
            if (text !== undefined) {
                datum[as] = this.font.metrics.measureWidth(text, size);
            } else {
                datum[as] = 0;
            }
            this._propagate(datum);
        };
    }

    initialize() {
        const fontManager = this.paramRuntimeProvider.context.fontManager;
        // Resolve the font during flow initialization so viewDataInit's global
        // font wait also covers measureText before any rows are propagated.
        this.font = this.params.font
            ? fontManager.getFont(
                  this.params.font,
                  this.params.fontStyle,
                  this.params.fontWeight
              )
            : fontManager.getDefaultFont();
    }
}
