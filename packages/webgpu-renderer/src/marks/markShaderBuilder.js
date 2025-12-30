import SCALES_WGSL from "../wgsl/scales.wgsl.js";
import {
    DOMAIN_PREFIX,
    RANGE_PREFIX,
    SCALED_FUNCTION_PREFIX,
} from "../wgsl/prefixes.js";

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

    /**
     * @param {import("../types.js").ScalarType} type
     * @param {1|2|4} components
     * @param {number|number[]} value
     * @returns {string}
     */
    const formatLiteral = (type, components, value) => {
        const scalarType =
            type === "u32" ? "u32" : type === "i32" ? "i32" : "f32";

        /**
         * @param {number} v
         * @returns {string}
         */
        const formatScalar = (v) => {
            const num = Number(v ?? 0);
            if (type === "u32") {
                return `u32(${Math.trunc(num)})`;
            }
            if (type === "i32") {
                return `i32(${Math.trunc(num)})`;
            }
            return `${num}`;
        };
        if (components === 1) {
            return formatScalar(Array.isArray(value) ? value[0] : value);
        }
        const values = Array.isArray(value) ? value : [value];
        const padded = values.slice(0, components);
        while (padded.length < components) {
            padded.push(0);
        }
        return `vec${components}<${scalarType}>(${padded
            .map(formatScalar)
            .join(", ")})`;
    };

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
        const components = channel.components ?? 1;
        const bufferName = `buf_${name}`;
        const arrayType =
            components === 1 ? `array<${scalarType}>` : "array<f32>";

        bufferDecls.push(
            `@group(1) @binding(${binding}) var<storage, read> ${bufferName}: ${arrayType};`
        );

        if (components > 1 && type !== "f32") {
            // TODO: Support vector types with non-f32 data.
        }

        if (components === 1) {
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

        const scale = channel.scale?.type ?? "identity";
        if (components === 1) {
            if (scale === "linear") {
                const vExpr =
                    scalarType === "f32"
                        ? "read_" + name + "(i)"
                        : `f32(read_${name}(i))`;
                channelFns.push(
                    `fn ${SCALED_FUNCTION_PREFIX}${name}(i: u32) -> f32 {
  let v = ${vExpr};
  return scaleLinear(v, params.${DOMAIN_PREFIX}${name}.xy, params.${RANGE_PREFIX}${name}.xy);
}`
                );
            } else {
                const returnType = scalarType;
                channelFns.push(
                    `fn ${SCALED_FUNCTION_PREFIX}${name}(i: u32) -> ${returnType} { return read_${name}(i); }`
                );
            }
        } else {
            channelFns.push(
                `fn ${SCALED_FUNCTION_PREFIX}${name}(i: u32) -> vec4<f32> { return read_${name}(i); }`
            );
        }
    }

    for (const [name, channel] of Object.entries(channels)) {
        if (channel.value == null && channel.default == null) {
            continue;
        }
        const components = channel.components ?? 1;
        const scale = channel.scale?.type ?? "identity";
        const uniformName = `u_${name}`;
        const type = channel.type ?? "f32";
        const scalarType =
            type === "u32" ? "u32" : type === "i32" ? "i32" : "f32";
        const isDynamic = "dynamic" in channel && channel.dynamic === true;
        const literal = formatLiteral(
            type,
            components,

            /** @type {number|number[]} */ (channel.value)
        );
        const rawValueExpr = isDynamic ? `params.${uniformName}` : literal;
        const valueExpr =
            scalarType === "f32" ? rawValueExpr : `f32(${rawValueExpr})`;
        if (components === 1) {
            if (scale === "linear") {
                channelFns.push(
                    `fn ${SCALED_FUNCTION_PREFIX}${name}(_i: u32) -> f32 {
  let v = ${valueExpr};
  return scaleLinear(v, params.${DOMAIN_PREFIX}${name}.xy, params.${RANGE_PREFIX}${name}.xy);
}`
                );
            } else {
                const returnType = scalarType;
                channelFns.push(
                    `fn ${SCALED_FUNCTION_PREFIX}${name}(_i: u32) -> ${returnType} { return ${rawValueExpr}; }`
                );
            }
        } else {
            channelFns.push(
                `fn ${SCALED_FUNCTION_PREFIX}${name}(_i: u32) -> vec4<f32> { return ${rawValueExpr}; }`
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
