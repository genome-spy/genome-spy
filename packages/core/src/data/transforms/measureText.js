import FlowNode, { BEHAVIOR_MODIFIES } from "../flowNode.js";
import fontMetadata from "../../fonts/Lato-Regular.json";
import getMetrics from "../../fonts/bmFontMetrics.js";
import { field } from "../../utils/field.js";

/**
 * Measures text length. This is mainly intended for reading-direction arrows
 * in gene annotations.
 */
export default class MeasureTextTransform extends FlowNode {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     *
     * @param {import("../../spec/transform").MeasureTextParams} config
     */
    constructor(config) {
        super();

        const metrics = getMetrics(fontMetadata);
        const accessor = field(config.field);
        const as = config.as;
        // TODO: Support custom fonts.
        const size = config.fontSize;

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
