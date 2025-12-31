import SCALES_WGSL from "../wgsl/scales.wgsl.js";
import {
    RANGE_SAMPLER_PREFIX,
    RANGE_TEXTURE_PREFIX,
    SCALED_FUNCTION_PREFIX,
} from "../wgsl/prefixes.js";
import {
    buildScaledFunction,
    formatLiteral,
    getScaleOutputType,
    isPiecewiseScale,
} from "./scaleCodegen.js";
import { usesRangeTexture } from "./domainRangeUtils.js";

/**
 * @typedef {import("../index.d.ts").ChannelConfigResolved} ChannelConfigResolved
 *
 * @typedef {object} ShaderBuildParams
 * @prop {Record<string, ChannelConfigResolved>} channels
 * @prop {{ name: string, type: import("../types.js").ScalarType, components: 1|2|4, arrayLength?: number }[]} uniformLayout
 * @prop {string} shaderBody
 *
 * @typedef {{ name: string, role: "series"|"ordinalRange"|"rangeTexture"|"rangeSampler" }} ResourceLayoutEntry
 *
 * @typedef {{ shaderCode: string, resourceBindings: GPUBindGroupLayoutEntry[], resourceLayout: ResourceLayoutEntry[] }} ShaderBuildResult
 */

/**
 * Builds WGSL shader code and bind group layout entries for a mark.
 * This is pure string generation and does not touch the GPU.
 *
 * @param {ShaderBuildParams} params
 * @returns {ShaderBuildResult}
 */
export function buildMarkShader({ channels, uniformLayout, shaderBody }) {
    // Dynamic shader generation: each mark variant emits only the helpers it
    // needs. This keeps WGSL small, avoids unused bindings, and lets us
    // specialize per-mark scale logic without a single "uber" shader.

    // Storage buffers are bound after the uniform buffer (binding 0). We keep
    // their order stable so the pipeline layout matches the generated WGSL.
    /** @type {GPUBindGroupLayoutEntry[]} */
    const resourceBindings = [];
    /** @type {ResourceLayoutEntry[]} */
    const resourceLayout = [];

    // WGSL snippets are accumulated and stitched together at the end. This
    // keeps generator logic readable and makes it easy to add/remove blocks.
    /** @type {string[]} */
    const bufferDecls = [];

    /** @type {string[]} */
    const bufferReaders = [];

    /** @type {string[]} */
    const channelFns = [];

    let bindingIndex = 1;

    // Literal formatting is centralized so constants always match the expected
    // WGSL types (e.g., float literals use ".0" when appropriate).

    // First pass: series-backed channels become storage buffers, read_* accessors,
    // and getScaled_* wrappers.
    for (const [name, channel] of Object.entries(channels)) {
        if (channel.data == null) {
            continue;
        }

        const binding = bindingIndex++;
        resourceBindings.push({
            binding,
            // eslint-disable-next-line no-undef
            visibility: GPUShaderStage.VERTEX,
            buffer: { type: "read-only-storage" },
        });
        resourceLayout.push({ name, role: "series" });

        const type = channel.type ?? "f32";
        const scalarType =
            type === "u32" ? "u32" : type === "i32" ? "i32" : "f32";
        const outputComponents = channel.components ?? 1;
        const inputComponents = channel.inputComponents ?? outputComponents;
        const bufferName = `buf_${name}`;
        const arrayType =
            inputComponents === 1 ? `array<${scalarType}>` : "array<f32>";

        bufferDecls.push(
            `@group(1) @binding(${binding}) var<storage, read> ${bufferName}: ${arrayType};`
        );

        if (inputComponents > 1 && type !== "f32") {
            // TODO: Support vector types with non-f32 data.
        }

        if (inputComponents === 1) {
            const readFn = `fn read_${name}(i: u32) -> ${scalarType} { return ${bufferName}[i]; }`;
            bufferReaders.push(readFn);
        } else {
            bufferReaders.push(
                `fn read_${name}(i: u32) -> vec4<f32> {
    let base = i * 4u;
    return vec4<f32>(${bufferName}[base], ${bufferName}[base + 1u], ${bufferName}[base + 2u], ${bufferName}[base + 3u]);
}`
            );
        }

        // getScaled_* is the only function mark shaders call. It hides whether
        // values come from buffers or uniforms and applies scale logic.
        const scale = channel.scale?.type ?? "identity";
        const outputScalarType =
            outputComponents === 1
                ? getScaleOutputType(scale, scalarType)
                : "f32";
        const useRangeTexture = usesRangeTexture(
            channel.scale,
            outputComponents
        );
        const needsScaleFunction =
            outputComponents === 1 ||
            scale !== "identity" ||
            isPiecewiseScale(channel.scale) ||
            useRangeTexture;
        if (needsScaleFunction) {
            channelFns.push(
                buildScaledFunction({
                    name,
                    scale,
                    rawValueExpr: `read_${name}(i)`,
                    inputScalarType: scalarType,
                    outputComponents,
                    outputScalarType,
                    scaleConfig: channel.scale,
                    useRangeTexture,
                })
            );
        } else {
            channelFns.push(
                `fn ${SCALED_FUNCTION_PREFIX}${name}(i: u32) -> vec4<f32> { return read_${name}(i); }`
            );
        }
    }

    // Ordinal scales pull range values from storage buffers. These bindings are
    // separate from data buffers so ranges can grow/shrink without changing
    // per-instance series data.
    for (const [name, channel] of Object.entries(channels)) {
        if (channel.scale?.type !== "ordinal") {
            continue;
        }

        const binding = bindingIndex++;
        resourceBindings.push({
            binding,
            // eslint-disable-next-line no-undef
            visibility: GPUShaderStage.VERTEX,
            buffer: { type: "read-only-storage" },
        });
        resourceLayout.push({ name, role: "ordinalRange" });

        const outputComponents = channel.components ?? 1;
        const type = channel.type ?? "f32";
        const scalarType =
            type === "u32" ? "u32" : type === "i32" ? "i32" : "f32";
        const outputScalarType =
            outputComponents === 1
                ? getScaleOutputType("ordinal", scalarType)
                : "f32";
        const elementType =
            outputComponents === 1 ? outputScalarType : "vec4<f32>";
        const rangeBufferName = `range_${name}`;

        bufferDecls.push(
            `@group(1) @binding(${binding}) var<storage, read> ${rangeBufferName}: array<${elementType}>;`
        );
    }

    // Color ramps are stored as textures so interpolation matches d3 in
    // non-RGB color spaces when requested.
    for (const [name, channel] of Object.entries(channels)) {
        if (!usesRangeTexture(channel.scale, channel.components ?? 1)) {
            continue;
        }

        const textureBinding = bindingIndex++;
        resourceBindings.push({
            binding: textureBinding,
            // eslint-disable-next-line no-undef
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            texture: { sampleType: "float" },
        });
        resourceLayout.push({ name, role: "rangeTexture" });
        bufferDecls.push(
            `@group(1) @binding(${textureBinding}) var ${RANGE_TEXTURE_PREFIX}${name}: texture_2d<f32>;`
        );

        const samplerBinding = bindingIndex++;
        resourceBindings.push({
            binding: samplerBinding,
            // eslint-disable-next-line no-undef
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            sampler: { type: "filtering" },
        });
        resourceLayout.push({ name, role: "rangeSampler" });
        bufferDecls.push(
            `@group(1) @binding(${samplerBinding}) var ${RANGE_SAMPLER_PREFIX}${name}: sampler;`
        );
    }

    // Second pass: value-backed channels become either uniforms (dynamic) or
    // inline WGSL constants (static), but still expose getScaled_*.
    for (const [name, channel] of Object.entries(channels)) {
        if (channel.value == null && channel.default == null) {
            continue;
        }
        const outputComponents = channel.components ?? 1;
        const scale = channel.scale?.type ?? "identity";
        const uniformName = `u_${name}`;
        const type = channel.type ?? "f32";
        const scalarType =
            type === "u32" ? "u32" : type === "i32" ? "i32" : "f32";
        const isDynamic = "dynamic" in channel && channel.dynamic === true;
        const literal = formatLiteral(
            type,
            outputComponents,

            /** @type {number|number[]} */ (channel.value)
        );
        const rawValueExpr = isDynamic ? `params.${uniformName}` : literal;
        const outputScalarType =
            outputComponents === 1
                ? getScaleOutputType(scale, scalarType)
                : "f32";
        const useRangeTexture = usesRangeTexture(
            channel.scale,
            outputComponents
        );
        const needsScaleFunction =
            outputComponents === 1 ||
            scale !== "identity" ||
            isPiecewiseScale(channel.scale) ||
            useRangeTexture;
        if (needsScaleFunction) {
            channelFns.push(
                buildScaledFunction({
                    name,
                    scale,
                    rawValueExpr,
                    inputScalarType: scalarType,
                    outputComponents,
                    outputScalarType,
                    scaleConfig: channel.scale,
                    useRangeTexture,
                })
            );
        } else {
            channelFns.push(
                `fn ${SCALED_FUNCTION_PREFIX}${name}(_i: u32) -> vec4<f32> { return ${rawValueExpr}; }`
            );
        }
    }

    // Uniform layout is provided by BaseProgram; we emit fields in the same order.
    const uniformFields = uniformLayout
        .map(({ name, type, components, arrayLength }) => {
            const scalar =
                type === "u32" ? "u32" : type === "i32" ? "i32" : "f32";
            const wgslType =
                components === 1
                    ? scalar
                    : components === 2
                      ? `vec2<${scalar}>`
                      : `vec4<${scalar}>`;
            const fieldType =
                arrayLength != null
                    ? // Uniform arrays require 16-byte aligned elements, so we
                      // store scalars in vec4 slots and read `.x` in codegen.
                      `array<vec4<${scalar}>, ${arrayLength}>`
                    : wgslType;
            return `    ${name}: ${fieldType},`;
        })
        .join("\n");

    // Compose the final WGSL with scale helpers, per-channel accessors,
    // and the mark-specific shader body.
    const shaderCode = /* wgsl */ `
struct Globals {
    width: f32,
    height: f32,
    dpr: f32,
};

@group(0) @binding(0) var<uniform> globals: Globals;

${SCALES_WGSL}

struct Params {
${uniformFields}
};

@group(1) @binding(0) var<uniform> params: Params;

${bufferDecls.join("\n")}

${bufferReaders.join("\n")}

${channelFns.join("\n")}

${shaderBody}
`;

    return { shaderCode, resourceBindings, resourceLayout };
}
