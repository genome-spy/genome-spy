import { DOMAIN_PREFIX } from "../../../wgsl/prefixes.js";
import {
    castToF32Step,
    clampToDomainStep,
    emitScalePipeline,
    piecewiseLinearStep,
} from "../scalePipeline.js";
import {
    domainVec2,
    emitContinuousScale,
    rangeVec2,
} from "../scaleEmitUtils.js";

/**
 * @param {import("../../../index.d.ts").ScaleEmitParams} params
 * @returns {string}
 */
function emitLinearScale(params) {
    const {
        name,
        rawValueExpr,
        inputScalarType,
        outputComponents,
        outputScalarType,
        clamp,
        round,
        useRangeTexture,
        domainLength,
        rangeLength,
    } = params;
    const resolvedDomainLength = domainLength || 2;
    const resolvedRangeLength = rangeLength || 2;

    if (resolvedDomainLength < 2 || resolvedRangeLength < 2) {
        throw new Error(
            `Linear scale on "${name}" requires at least two domain and range entries.`
        );
    }
    if (resolvedDomainLength !== resolvedRangeLength) {
        throw new Error(
            `Linear scale on "${name}" requires matching domain/range arrays.`
        );
    }

    if (
        resolvedDomainLength === 2 &&
        resolvedRangeLength === 2 &&
        (useRangeTexture || outputComponents === 1)
    ) {
        return emitContinuousScale(
            {
                name,
                rawValueExpr,
                inputScalarType,
                clamp,
                round,
                useRangeTexture,
            },
            ({ name: scaleName, valueExpr }) =>
                `scaleLinear(${valueExpr}, ${domainVec2(
                    scaleName
                )}, ${rangeVec2(scaleName)})`
        );
    }

    const returnType = useRangeTexture
        ? "vec4<f32>"
        : outputComponents === 1
          ? outputScalarType
          : `vec${outputComponents}<f32>`;
    /** @type {import("../scalePipeline.js").ScalePipelineStep[]} */
    const steps = [];
    if (inputScalarType !== "f32") {
        steps.push(castToF32Step(inputScalarType));
    }
    if (clamp) {
        const domainExpr = `vec2<f32>(params.${DOMAIN_PREFIX}${name}[0].x, params.${DOMAIN_PREFIX}${name}[${resolvedDomainLength}u - 1u].x)`;
        steps.push(clampToDomainStep(domainExpr));
    }
    steps.push(
        piecewiseLinearStep({
            name,
            domainLength: resolvedDomainLength,
            outputComponents,
            outputScalarType,
            useRangeTexture,
        })
    );
    return emitScalePipeline({
        name,
        rawValueExpr,
        steps,
        returnType,
        useRangeTexture,
    });
}

/** @type {import("../../../index.d.ts").ScaleDef} */
export const linearScaleDef = {
    input: "numeric",
    output: "f32",
    params: [],
    continuous: true,
    resources: {
        domainRangeKind: "continuous",
        supportsPiecewise: true,
        needsDomainMap: false,
        needsOrdinalRange: false,
    },
    emit: emitLinearScale,
};
