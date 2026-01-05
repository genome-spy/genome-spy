import {
    castToF32Step,
    emitScalePipeline,
    thresholdStep,
} from "../scalePipeline.js";

/**
 * Threshold scale: maps numeric input to discrete range steps by domain breaks.
 *
 * Technical notes: uses the pipeline threshold step to emit a small WGSL loop
 * that picks the correct slot from the range array.
 *
 * @type {import("../../../index.d.ts").ScaleDef}
 */
export const thresholdScaleDef = {
    input: "numeric",
    output: "same",
    params: [],
    continuous: false,
    vectorOutput: "always",
    resources: {
        stopKind: "threshold",
        needsDomainMap: false,
        needsOrdinalRange: false,
    },
    validate: validateThresholdScale,
    emit: emitThresholdScale,
};

/**
 * @param {import("../../../index.d.ts").ScaleEmitParams} params
 * @returns {string}
 */
function emitThresholdScale({
    name,
    rawValueExpr,
    inputScalarType,
    outputComponents,
    outputScalarType,
    domainLength,
    rangeLength,
}) {
    if (domainLength < 1 || rangeLength !== domainLength + 1) {
        throw new Error(
            `Threshold scale on "${name}" requires domain length N and range length N+1.`
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
        thresholdStep({
            name,
            domainLength,
            outputComponents,
            outputScalarType,
        })
    );
    return emitScalePipeline({
        name,
        rawValueExpr,
        steps,
        returnType,
    });
}

/**
 * @param {import("../../../index.d.ts").ScaleValidationContext} context
 * @returns {string | null}
 */
function validateThresholdScale({
    name,
    channel,
    outputComponents,
    inputComponents,
}) {
    if (outputComponents !== 1 && outputComponents !== 4) {
        return `Channel "${name}" uses ${outputComponents} components but threshold scales only support scalars or vec4 outputs.`;
    }
    const domain = channel.scale?.domain;
    const range = channel.scale?.range;
    if (!Array.isArray(domain) || domain.length === 0) {
        return `Threshold scale on "${name}" requires a non-empty domain.`;
    }
    if (!Array.isArray(range) || range.length < 2) {
        return `Threshold scale on "${name}" requires at least two range entries.`;
    }
    if (range.length !== domain.length + 1) {
        return `Threshold scale on "${name}" requires range length of ${
            domain.length + 1
        }, got ${range.length}.`;
    }
    if (inputComponents !== 1) {
        return `Threshold scale on "${name}" requires scalar input values.`;
    }
    return null;
}
