import createScale from "../scale/scale.js";
import { interpolate } from "d3-interpolate";
import { isFieldDef, isValueDef } from "../encoder/encoder.js";
import { isDataReady, iterateDataDependencies } from "../data/dataReadiness.js";
import SingleAxisLazySource from "../data/sources/lazy/singleAxisLazySource.js";
import { getViewSelector } from "../view/viewSelectors.js";

const REGION_SCALE_TYPES = ["linear", "log", "sqrt", "pow", "symlog"];

/**
 * Validates the positional field contract without requiring loaded rows.
 * @param {import("../view/unitView.js").default} view
 * @returns {{x: string, y: string}}
 */
export function getRegionFields(view) {
    if (view.getMarkType() !== "point") {
        throw new Error("Region selection requires a point mark.");
    }

    const encoding = view.mark.encoding;
    /** @type {{ x: string, y: string }} */
    const fields = { x: "", y: "" };
    for (const channel of /** @type {const} */ (["x", "y"])) {
        const def = encoding[channel];
        if (
            !isFieldDef(def) ||
            "condition" in def ||
            !("type" in def) ||
            def.type !== "quantitative" ||
            !view.getScaleResolution(channel)
        ) {
            throw new Error(
                `Region selection requires an unconditional quantitative ${channel} field with a supported numeric scale.`
            );
        }
        fields[channel] = def.field;
    }

    for (const channel of /** @type {const} */ ([
        "xOffset",
        "yOffset",
        "dx",
        "dy",
    ])) {
        const def = encoding[channel];
        if (def && !(isValueDef(def) && def.value === 0)) {
            throw new Error("Region selection does not support point offsets.");
        }
    }

    return fields;
}

/**
 * Resolves the supported center-based lasso projection from an initialized mark.
 * Capture the forward mappings so membership survives navigation and replay.
 *
 * @param {import("../view/unitView.js").default} view
 * @returns {Pick<import("../types/selectionTypes.js").RegionSelectionIntent, "fields" | "producer" | "scales">}
 */
export function getRegionProjection(view) {
    const fields = getRegionFields(view);
    const collector = view.getCollector();
    if (!collector || !isDataReady(collector)) {
        throw new Error("Region selection requires ready producer data.");
    }
    for (const node of iterateDataDependencies(collector)) {
        if (node instanceof SingleAxisLazySource) {
            throw new Error(
                "Region selection requires a complete, eager population."
            );
        }
    }

    return {
        fields,
        producer: getViewSelector(view),
        scales: {
            x: captureRegionScale(view.getScaleResolution("x").getScale()),
            y: captureRegionScale(view.getScaleResolution("y").getScale()),
        },
    };
}

/** @typedef {import("../types/selectionTypes.js").RegionScaleMapping} RegionScaleMapping */

/**
 * @param {import("../types/encoder.js").VegaScale} source
 * @returns {RegionScaleMapping}
 */
export function captureRegionScale(source) {
    const scale =
        /** @type {import("d3-scale").ScaleLinear<number, number> & {type: RegionScaleMapping["type"], base?: () => number, exponent?: () => number, constant?: () => number}} */ (
            source
        );
    if (!REGION_SCALE_TYPES.includes(scale.type)) {
        throw new Error("Region selection requires a supported numeric scale.");
    }
    if (scale.interpolate() !== interpolate) {
        throw new Error(
            "Region selection does not support rounded or custom interpolation."
        );
    }
    /** @type {RegionScaleMapping} */
    const mapping = {
        type: scale.type,
        domain: scale.domain(),
        range: scale.range(),
        clamp: scale.clamp(),
    };
    for (const key of /** @type {const} */ (["base", "exponent", "constant"])) {
        if (scale[key]) mapping[key] = scale[key]();
    }
    restoreRegionScale(mapping);
    return mapping;
}

/**
 * Rebuilds a resolved mapping without rerunning domain policy such as nice/zero.
 * Also validates externally supplied intent before any membership is published.
 * @param {RegionScaleMapping} mapping
 * @returns {import("d3-scale").ScaleContinuousNumeric<number, number>}
 */
export function restoreRegionScale(mapping) {
    if (
        !REGION_SCALE_TYPES.includes(mapping.type) ||
        !Array.isArray(mapping.domain) ||
        !Array.isArray(mapping.range) ||
        mapping.domain.length < 2 ||
        mapping.range.length !== mapping.domain.length ||
        !mapping.domain.every(Number.isFinite) ||
        !mapping.range.every(Number.isFinite) ||
        typeof mapping.clamp !== "boolean"
    ) {
        throw new Error("Invalid captured region scale mapping.");
    }
    const scale = createScale({
        type: mapping.type,
        zero: false,
        clamp: mapping.clamp,
    });
    for (const key of /** @type {const} */ (["base", "exponent", "constant"])) {
        if (
            mapping[key] !== undefined &&
            (!Number.isFinite(mapping[key]) ||
                (key !== "exponent" && mapping[key] <= 0) ||
                (key === "base" && mapping[key] === 1) ||
                typeof scale[key] !== "function")
        ) {
            throw new Error("Invalid captured region scale parameter: " + key);
        }
        if (mapping[key] !== undefined) scale[key](mapping[key]);
    }
    if (
        mapping.type === "log" &&
        mapping.domain.some(
            (value) =>
                value === 0 || Math.sign(value) !== Math.sign(mapping.domain[0])
        )
    ) {
        throw new Error("Captured log domain must have one nonzero sign.");
    }
    return scale.domain(mapping.domain).range(mapping.range);
}
