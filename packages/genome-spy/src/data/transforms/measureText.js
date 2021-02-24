import FlowNode, { BEHAVIOR_MODIFIES } from "../flowNode";
import fontMetadata from "../../fonts/Lato-Regular.json";
import getMetrics from "../../fonts/bmFontMetrics";
import { field } from "../../utils/field";

/**
 * Measures text length. This is mainly intended for reading-direction arrows
 * in gene annotations.
 *
 * @typedef {import("../../spec/transform").MeasureTextParams} MeasureTextParams
 */
export default class MeasureTextTransform extends FlowNode {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     *
     * @param {MeasureTextParams} config
     */
    constructor(config) {
        super();

        const metrics = getMetrics(fontMetadata);
        const accessor = field(config.field);
        const as = config.as;
        const size = config.fontSize;

        /**
         *
         * @param {any} datum
         */
        this.handle = datum => {
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
