import { field } from "vega-util";
import FlowNode, { BEHAVIOR_MODIFIES } from "../flowNode";

/**
 * @typedef {import("../../spec/transform").RegexExtractConfig} RegexExtractConfig
 */

export default class RegexExtractTransform extends FlowNode {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     * @param {RegexExtractConfig} params
     */
    constructor(params) {
        super();

        const re = new RegExp(params.regex);
        const as = typeof params.as == "string" ? [params.as] : params.as;
        const accessor = field(params.field);

        /**
         *
         * @param {any} datum
         */
        this.handle = datum => {
            const value = accessor(datum);
            if (typeof value === "string") {
                const m = value.match(re);

                if (m) {
                    if (m.length - 1 != as.length) {
                        throw new Error(
                            'The number of RegEx groups and the length of "as" do not match!'
                        );
                    }

                    as.forEach((group, i) => {
                        datum[group] = m[i + 1];
                    });
                } else if (!params.skipInvalidInput) {
                    throw new Error(
                        `"${value}" does not match the given regex: ${re.toString()}`
                    );
                }
            } else if (!params.skipInvalidInput) {
                throw new Error(
                    `Trying to match a non-string field. Encountered type: ${typeof value}`
                );
            }

            this._propagate(datum);
        };
    }
}
