import { isObject } from "vega-util";
import { isLayerSpec, isUnitSpec } from "@genome-spy/core/view/viewFactory.js";

/**
 * @param {import("@genome-spy/core/spec/view.js").ViewSpec} spec
 * @returns {spec is import("@genome-spy/app/spec/sampleView.js").SampleSpec}
 */
export function isSampleSpec(spec) {
    return (
        "samples" in spec &&
        isObject(spec.samples) &&
        "spec" in spec &&
        isObject(spec.spec)
    );
}

/**
 * @param {import("@genome-spy/core/spec/view.js").ViewSpec} spec
 * @returns {spec is import("@genome-spy/app/spec/view.js").AggregatingSpec & { aggregateSamples: import("@genome-spy/app/spec/view.js").AggregatingSpec[] }}
 */
export function isAggregateSamplesSpec(spec) {
    return (
        spec &&
        (isUnitSpec(spec) || isLayerSpec(spec)) &&
        "aggregateSamples" in spec
    );
}
