import {
    castToF32Step,
    emitScalePipeline,
    quantizeStep,
} from "../scalePipeline.js";

/**
 * Quantize scale: maps a continuous domain into discrete range buckets.
 *
 * Technical notes: computes a normalized unit value, clamps it to [0, 1],
 * and uses floor(unit * rangeLength) to select a range slot.
 *
 * @type {import("../../../index.d.ts").ScaleDef}
 */
export const quantizeScaleDef = {
    type: "quantize",
    input: "numeric",
    output: "same",
    params: [],
    continuous: false,
    vectorOutput: "always",
    resources: {
        stopKind: "continuous",
        needsDomainMap: false,
        needsOrdinalRange: false,
    },
    getStopLengths: getQuantizeStopLengths,
    validate: validateQuantizeScale,
    emit: emitQuantizeScale,
};
Object.freeze(quantizeScaleDef);

/**
 * @param {import("../../../index.d.ts").ScaleEmitParams} params
 * @returns {string}
 */
function emitQuantizeScale({
    name,
    functionName,
    rawValueExpr,
    inputScalarType,
    outputComponents,
    outputScalarType,
    rangeLength,
}) {
    if (rangeLength < 1) {
        throw new Error(
            `Quantize scale on "${name}" must define at least one range entry.`
        );
    }
    const returnType =
        outputComponents === 1
            ? outputScalarType
            : `vec${outputComponents}<f32>`;
    /** @type {import("../scalePipeline.js").ScalePipelineStep[]} */
    const steps = [];
    if (inputScalarType !== "f32") {
        steps.push(castToF32Step(inputScalarType));
    }
    steps.push(
        quantizeStep({
            name,
            rangeLength,
            outputComponents,
            outputScalarType,
        })
    );
    return emitScalePipeline({
        name,
        functionName,
        rawValueExpr,
        steps,
        returnType,
    });
}

/**
 * @param {import("../../../index.d.ts").ScaleValidationContext} context
 * @returns {string | null}
 */
function validateQuantizeScale({
    name,
    channel,
    outputComponents,
    inputComponents,
}) {
    if (outputComponents !== 1 && outputComponents !== 4) {
        return `Channel "${name}" uses ${outputComponents} components but quantize scales only support scalars or vec4 outputs.`;
    }
    if (inputComponents !== 1) {
        return `Quantize scale on "${name}" requires scalar input values.`;
    }
    const domain = channel.scale?.domain;
    if (Array.isArray(domain) && domain.length !== 2) {
        return `Quantize scale on "${name}" requires a domain with exactly two entries.`;
    }
    const range = channel.scale?.range;
    if (range !== undefined && !Array.isArray(range)) {
        return `Quantize scale on "${name}" requires an explicit array range.`;
    }
    if (Array.isArray(range) && range.length < 1) {
        return `Quantize scale on "${name}" requires at least one range entry.`;
    }
    return null;
}

/**
 * @param {import("../../../index.d.ts").ScaleStopLengthParams} params
 * @returns {import("../../../index.d.ts").ScaleStopLengths}
 */
function getQuantizeStopLengths({ scale }) {
    const range = Array.isArray(scale.range) ? scale.range : [0, 1];
    if (range.length < 1) {
        throw new Error(
            `Quantize scale on "${scale.type}" requires at least one range entry.`
        );
    }
    return { domainLength: 2, rangeLength: range.length };
}
