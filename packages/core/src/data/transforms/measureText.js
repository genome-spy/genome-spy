import { BEHAVIOR_MODIFIES } from "../flowNode.js";
import fontMetadata from "../../fonts/Lato-Regular.json";
import getMetrics from "../../fonts/bmFontMetrics.js";
import { field } from "../../utils/field.js";
import Transform from "./transform.js";

/**
 * Measures text length. This is mainly intended for reading-direction arrows
 * in gene annotations.
 */
export default class MeasureTextTransform extends Transform {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     *
     * @param {import("../../spec/transform.js").MeasureTextParams} params
     */
    constructor(params) {
        super(params);

        this.params = params;

        const metrics = getMetrics(fontMetadata);
        const accessor = field(params.field);
        const as = params.as;
        // TODO: Support custom fonts.
        const size = params.fontSize;

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
