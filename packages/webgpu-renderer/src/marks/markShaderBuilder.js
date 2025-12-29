import SCALES_WGSL from "../wgsl/scales.wgsl.js";

/**
 * @typedef {import("../index.d.ts").ChannelConfigResolved} ChannelConfigResolved
 *
 * @typedef {object} ShaderBuildParams
 * @prop {Record<string, ChannelConfigResolved>} channels
 * @prop {{ name: string, type: "f32"|"u32"|"i32", components: 1|2|4 }[]} uniformLayout
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
    // Dynamic shader generation: build per-channel read + scale functions
    // based on series/value presence and scale types.
    /** @type {GPUBindGroupLayoutEntry[]} */
    const bufferBindings = [];
    /** @type {string[]} */
    const bufferDecls = [];
    /** @type {string[]} */
    const bufferReaders = [];
    /** @type {string[]} */
    const channelFns = [];

    let bindingIndex = 1;
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
        const components = channel.components ?? 1;
        const bufferName = `buf_${name}`;
        const arrayType =
            components === 1
                ? type === "f32"
                    ? "array<f32>"
                    : type === "u32"
                      ? "array<u32>"
                      : "array<i32>"
                : "array<f32>";

        bufferDecls.push(
            `@group(1) @binding(${binding}) var<storage, read> ${bufferName}: ${arrayType};`
        );

        if (components > 1 && type !== "f32") {
            // TODO: Support vector types with non-f32 data.
        }

        if (components === 1) {
            const readFn =
                type === "f32"
                    ? `fn read_${name}(i: u32) -> f32 { return ${bufferName}[i]; }`
                    : type === "u32"
                      ? `fn read_${name}(i: u32) -> f32 { return f32(${bufferName}[i]); }`
                      : `fn read_${name}(i: u32) -> f32 { return f32(${bufferName}[i]); }`;
            bufferReaders.push(readFn);
        } else {
            bufferReaders.push(
                `fn read_${name}(i: u32) -> vec4<f32> {
  let base = i * 4u;
  return vec4<f32>(${bufferName}[base], ${bufferName}[base + 1u], ${bufferName}[base + 2u], ${bufferName}[base + 3u]);
}`
            );
        }

        const scale = channel.scale?.type ?? "identity";
        if (components === 1) {
            if (scale === "linear") {
                channelFns.push(
                    `fn getScaled_${name}(i: u32) -> f32 {
  let v = read_${name}(i);
  return scaleLinear(v, params.u_${name}_domain.xy, params.u_${name}_range.xy);
}`
                );
            } else {
                channelFns.push(
                    `fn getScaled_${name}(i: u32) -> f32 { return read_${name}(i); }`
                );
            }
        } else {
            channelFns.push(
                `fn getScaled_${name}(i: u32) -> vec4<f32> { return read_${name}(i); }`
            );
        }
    }

    for (const [name, channel] of Object.entries(channels)) {
        if (channel.value == null && channel.default == null) {
            continue;
        }
        const components = channel.components ?? 1;
        const scale = channel.scale?.type ?? "identity";
        if (components === 1) {
            if (scale === "linear") {
                channelFns.push(
                    `fn getScaled_${name}(_i: u32) -> f32 {
  let v = params.u_${name}.x;
  return scaleLinear(v, params.u_${name}_domain.xy, params.u_${name}_range.xy);
}`
                );
            } else {
                channelFns.push(
                    `fn getScaled_${name}(_i: u32) -> f32 { return params.u_${name}.x; }`
                );
            }
        } else {
            channelFns.push(
                `fn getScaled_${name}(_i: u32) -> vec4<f32> { return params.u_${name}; }`
            );
        }
    }

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
            return `  u_${name}: ${wgslType},`;
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
