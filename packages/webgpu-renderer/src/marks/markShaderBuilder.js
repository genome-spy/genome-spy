import SCALES_WGSL from "../wgsl/scales.wgsl.js";
import { SCALED_FUNCTION_PREFIX } from "../wgsl/prefixes.js";
import {
    buildScaledFunction,
    formatLiteral,
    getScaleOutputType,
    isPiecewiseScale,
} from "./scaleCodegen.js";

/**
 * @typedef {import("../index.d.ts").ChannelConfigResolved} ChannelConfigResolved
 *
 * @typedef {object} ShaderBuildParams
 * @prop {Record<string, ChannelConfigResolved>} channels
 * @prop {{ name: string, type: import("../types.js").ScalarType, components: 1|2|4 }[]} uniformLayout
 * @prop {string} shaderBody
 *
 * @typedef {{ shaderCode: string, bufferBindings: GPUBindGroupLayoutEntry[] }} ShaderBuildResult
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
    const bufferBindings = [];

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
        bufferBindings.push({
            binding,
            // eslint-disable-next-line no-undef
            visibility: GPUShaderStage.VERTEX,
            buffer: { type: "read-only-storage" },
        });

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
        if (outputComponents === 1) {
            channelFns.push(
                buildScaledFunction({
                    name,
                    scale,
                    rawValueExpr: `read_${name}(i)`,
                    scalarType,
                    outputComponents,
                    outputScalarType,
                    scaleConfig: channel.scale,
                })
            );
        } else if (scale === "threshold" || isPiecewiseScale(channel.scale)) {
            channelFns.push(
                buildScaledFunction({
                    name,
                    scale,
                    rawValueExpr: `read_${name}(i)`,
                    scalarType,
                    outputComponents,
                    outputScalarType,
                    scaleConfig: channel.scale,
                })
            );
        } else {
            channelFns.push(
                `fn ${SCALED_FUNCTION_PREFIX}${name}(i: u32) -> vec4<f32> { return read_${name}(i); }`
            );
        }
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
        if (outputComponents === 1) {
            channelFns.push(
                buildScaledFunction({
                    name,
                    scale,
                    rawValueExpr,
                    scalarType,
                    outputComponents,
                    outputScalarType,
                    scaleConfig: channel.scale,
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
        .map(({ name, type, components }) => {
            const scalar =
                type === "u32" ? "u32" : type === "i32" ? "i32" : "f32";
            const wgslType =
                components === 1
                    ? scalar
                    : components === 2
                      ? `vec2<${scalar}>`
                      : `vec4<${scalar}>`;
            return `  ${name}: ${wgslType},`;
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

    return { shaderCode, bufferBindings };
}
