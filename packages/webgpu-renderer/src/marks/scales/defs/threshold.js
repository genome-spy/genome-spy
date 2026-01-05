import {
    castToF32Step,
    emitScalePipeline,
    thresholdStep,
} from "../scalePipeline.js";

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

/** @type {import("../../../index.d.ts").ScaleDef} */
export const thresholdScaleDef = {
    input: "numeric",
    output: "same",
    params: [],
    continuous: false,
    resources: {
        domainRangeKind: "threshold",
        needsDomainMap: false,
        needsOrdinalRange: false,
    },
    emit: emitThresholdScale,
};
