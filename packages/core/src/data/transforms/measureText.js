import { BEHAVIOR_MODIFIES } from "../flowNode.js";
import fontMetadata from "../../fonts/Lato-Regular.json" with { type: "json" };
import getMetrics from "../../fonts/bmFontMetrics.js";
import { field } from "../../utils/field.js";
import Transform from "./transform.js";
import { isExprRef } from "../../view/paramMediator.js";

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
     * @param {import("../flowNode.js").ParamMediatorProvider} paramMediatorProvider
     */
    constructor(params, paramMediatorProvider) {
        super(params);

        this.params = params;

        const metrics = getMetrics(fontMetadata);
        const accessor = field(params.field);
        const as = params.as;
        // TODO: Support custom fonts.

        let size = 0;

        // TODO: Refactor this into reusable code.
        if (isExprRef(params.fontSize)) {
            const sizeExpr =
                paramMediatorProvider.paramMediator.createExpression(
                    params.fontSize.expr
                );
            size = sizeExpr();
            sizeExpr.addListener(() => {
                size = sizeExpr();
                this.repropagate();
            });
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
                datum[as] = metrics.measureWidth(text, size);
            } else {
                datum[as] = 0;
            }
            this._propagate(datum);
        };
    }
}
