import { isArray, isObject } from "vega-util";
import { isExprRef } from "../paramRuntime/paramUtils.js";

const DEFAULT_FADE = 0.5;

/**
 * @typedef {"unitsPerPixel"} MultiscaleMetric
 * @typedef {"x" | "y" | "auto"} MultiscaleChannel
 *
 * @typedef {{
 *     metric: MultiscaleMetric;
 *     values: number[] | import("../spec/parameter.js").ExprRef;
 *     channel: MultiscaleChannel;
 *     fade: number;
 * }} ParsedStops
 */

/**
 * @param {object} spec
 * @returns {spec is import("../spec/view.js").MultiscaleSpec}
 */
export function isMultiscaleSpec(spec) {
    return "multiscale" in spec && isArray(spec.multiscale);
}

/**
 * Converts a multiscale spec into a regular layer spec by wrapping each stage
 * into a generated opacity layer.
 *
 * @param {import("../spec/view.js").MultiscaleSpec} spec
 * @returns {import("../spec/view.js").LayerSpec}
 */
export function normalizeMultiscaleSpec(spec) {
    if (!spec.multiscale.length) {
        throw new Error('"multiscale" must contain at least one child view.');
    }

    const parsedStops = parseStops(spec.stops, spec.multiscale.length);

    /** @type {import("../spec/view.js").LayerSpec["layer"]} */
    const layer = spec.multiscale.map((child, i) => {
        if (spec.multiscale.length === 1) {
            return child;
        }

        return {
            opacity: createStageOpacity(i, spec.multiscale.length, parsedStops),
            layer: [child],
        };
    });

    const passThrough = { ...spec };
    delete passThrough.multiscale;
    delete passThrough.stops;

    return {
        ...passThrough,
        layer,
    };
}

/**
 * @param {import("../spec/view.js").MultiscaleStopsDef} stops
 * @param {number} stageCount
 * @returns {ParsedStops}
 */
function parseStops(stops, stageCount) {
    /** @type {MultiscaleMetric} */
    let metric = "unitsPerPixel";
    /** @type {number[] | import("../spec/parameter.js").ExprRef} */
    let values;
    /** @type {MultiscaleChannel} */
    let channel = "auto";
    let fade = DEFAULT_FADE;

    if (isArray(stops)) {
        if (stops.every(isExprRef)) {
            const expectedStopCount = stageCount - 1;

            if (stops.length !== expectedStopCount) {
                throw new Error(
                    "Invalid stop count for multiscale. Expected " +
                        expectedStopCount +
                        ", got " +
                        stops.length +
                        "."
                );
            }

            values = {
                expr:
                    "[" +
                    stops.map((stop) => "(" + stop.expr + ")").join(", ") +
                    "]",
            };
        } else {
            values = /** @type {number[]} */ (stops);
        }
    } else if (isExprRef(stops)) {
        values = stops;
    } else if (isObject(stops)) {
        metric = stops.metric ?? "unitsPerPixel";
        values = stops.values;
        channel = stops.channel ?? "auto";
        fade = stops.fade ?? DEFAULT_FADE;
    } else {
        throw new Error('"stops" must be an array or an object with "values".');
    }

    if (metric !== "unitsPerPixel") {
        throw new Error(
            'Only "unitsPerPixel" is supported for "stops.metric" in multiscale.'
        );
    }

    if (!["x", "y", "auto"].includes(channel)) {
        throw new Error('"stops.channel" must be one of "x", "y", or "auto".');
    }

    if (!Number.isFinite(fade) || fade < 0 || fade > 0.5) {
        throw new Error(
            '"stops.fade" must be a finite number in range [0, 0.5].'
        );
    }

    if (isExprRef(values)) {
        return {
            metric,
            values,
            channel,
            fade,
        };
    }

    if (!isArray(values)) {
        throw new Error(
            '"stops.values" must be an array of numbers or ExprRef.'
        );
    }

    const expectedStopCount = stageCount - 1;
    if (values.length !== expectedStopCount) {
        throw new Error(
            "Invalid stop count for multiscale. Expected " +
                expectedStopCount +
                ", got " +
                values.length +
                "."
        );
    }

    values.forEach((value, index) => {
        if (!Number.isFinite(value) || value <= 0) {
            throw new Error(
                "Invalid stop value at index " +
                    index +
                    ". Stop values must be positive finite numbers."
            );
        }
    });

    for (let i = 1; i < values.length; i++) {
        if (values[i - 1] <= values[i]) {
            throw new Error(
                '"stops.values" must be strictly decreasing for "unitsPerPixel".'
            );
        }
    }

    for (let i = 0; i < values.length - 1; i++) {
        const leftLower = values[i] * (1 - fade);
        const rightUpper = values[i + 1] * (1 + fade);
        if (leftLower <= rightUpper) {
            throw new Error(
                "Adjacent transitions overlap. Reduce fade or increase stop spacing."
            );
        }
    }

    return {
        metric,
        values,
        channel,
        fade,
    };
}

/**
 * @param {number} stageIndex
 * @param {number} stageCount
 * @param {ParsedStops} stops
 * @returns {import("../spec/view.js").DynamicOpacity}
 */
function createStageOpacity(stageIndex, stageCount, stops) {
    /** @type {number[] | import("../spec/parameter.js").ExprRef} */
    let unitsPerPixel;
    /** @type {number[]} */
    let values;

    if (isExprRef(stops.values)) {
        unitsPerPixel = {
            expr: createStageOpacityExpr(
                stageIndex,
                stageCount,
                stops.values.expr,
                stops.fade
            ),
        };
    } else {
        const transitions = stops.values.map((stop) => ({
            hi: stop * (1 + stops.fade),
            lo: stop * (1 - stops.fade),
        }));

        if (stageIndex === 0) {
            unitsPerPixel = [transitions[0].hi, transitions[0].lo];
        } else if (stageIndex === stageCount - 1) {
            const last = transitions.at(-1);
            unitsPerPixel = [last.hi, last.lo];
        } else {
            const previous = transitions[stageIndex - 1];
            const next = transitions[stageIndex];

            unitsPerPixel = [previous.hi, previous.lo, next.hi, next.lo];
        }
    }

    if (stageIndex === 0) {
        values = [1, 0];
    } else if (stageIndex === stageCount - 1) {
        values = [0, 1];
    } else {
        values = [0, 1, 1, 0];
    }

    return {
        channel: stops.channel,
        unitsPerPixel,
        values,
    };
}

/**
 * Builds a runtime expression that computes `opacity.unitsPerPixel` for one
 * generated multiscale stage.
 *
 * @param {number} stageIndex
 * @param {number} stageCount
 * @param {string} stopsExpr
 * @param {number} fade
 * @returns {string}
 */
function createStageOpacityExpr(stageIndex, stageCount, stopsExpr, fade) {
    const upperScale = 1 + fade;
    const lowerScale = 1 - fade;
    const stopsArrayExpr = `(${stopsExpr})`;

    /**
     * @param {number} index
     * @param {number} scale
     */
    const scaledStop = (index, scale) =>
        `(${stopsArrayExpr}[${index}]) * ${scale}`;

    /**
     * @param {number} index
     * @returns {string[]}
     */
    const transitionPair = (index) => [
        scaledStop(index, upperScale),
        scaledStop(index, lowerScale),
    ];

    /** @type {string[]} */
    let terms;

    if (stageIndex === 0) {
        terms = transitionPair(0);
    } else if (stageIndex === stageCount - 1) {
        terms = transitionPair(stageCount - 2);
    } else {
        terms = [
            ...transitionPair(stageIndex - 1),
            ...transitionPair(stageIndex),
        ];
    }

    return `[${terms.join(", ")}]`;
}
