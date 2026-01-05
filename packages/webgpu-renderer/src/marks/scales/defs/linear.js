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

const linearWgsl = /* wgsl */ `
fn scaleLinear(value: f32, domain: vec2<f32>, range: vec2<f32>) -> f32 {
    let domainSpan = domain.y - domain.x;
    let rangeSpan = range.y - range.x;
    return (value - domain.x) / domainSpan * rangeSpan + range.x;
}
`;

/**
 * Linear scale: maps numeric domain to numeric range with optional piecewise support.
 *
 * Technical notes: uses scalePipeline steps for casting/clamping and emits a
 * piecewise linear loop when domain/range arrays exceed two elements.
 *
 * @type {import("../../../index.d.ts").ScaleDef}
 */
export const linearScaleDef = {
    input: "numeric",
    output: "f32",
    params: [],
    continuous: true,
    vectorOutput: "always",
    wgsl: linearWgsl,
    resources: {
        domainRangeKind: "continuous",
        supportsPiecewise: true,
        needsDomainMap: false,
        needsOrdinalRange: false,
    },
    validate: validateLinearScale,
    emit: emitLinearScale,
};

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

/**
 * @param {import("../../../index.d.ts").ScaleValidationContext} context
 * @returns {string | null}
 */
function validateLinearScale({
    name,
    channel,
    outputComponents,
    inputComponents,
    isPiecewise,
}) {
    if (outputComponents !== 1 && outputComponents !== 4) {
        return `Channel "${name}" uses ${outputComponents} components but linear scales only support scalars or vec4 outputs.`;
    }

    if (!isPiecewise) {
        return null;
    }

    const domain = channel.scale?.domain;
    const range = channel.scale?.range;
    if (!Array.isArray(domain) || domain.length < 2) {
        return `Piecewise scale on "${name}" requires at least two domain entries.`;
    }
    if (!Array.isArray(range) || range.length < 2) {
        return `Piecewise scale on "${name}" requires at least two range entries.`;
    }
    if (domain.length !== range.length) {
        return `Piecewise scale on "${name}" requires range length of ${domain.length}, got ${range.length}.`;
    }
    if (inputComponents !== 1) {
        return `Piecewise scale on "${name}" requires scalar input values.`;
    }

    return null;
}

/** @type {import("../../../index.d.ts").ScaleDef} */
