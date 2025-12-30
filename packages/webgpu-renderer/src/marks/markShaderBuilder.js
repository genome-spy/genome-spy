import SCALES_WGSL from "../wgsl/scales.wgsl.js";
import {
    DOMAIN_PREFIX,
    RANGE_PREFIX,
    SCALED_FUNCTION_PREFIX,
    SCALE_ALIGN_PREFIX,
    SCALE_BASE_PREFIX,
    SCALE_BAND_PREFIX,
    SCALE_CONSTANT_PREFIX,
    SCALE_EXPONENT_PREFIX,
    SCALE_PADDING_INNER_PREFIX,
    SCALE_PADDING_OUTER_PREFIX,
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
 * @param {import("../types.js").ScalarType} type
 * @param {1|2|4} components
 * @param {number|number[]} value
 * @returns {string}
 */
function formatLiteral(type, components, value) {
    const scalarType = type === "u32" ? "u32" : type === "i32" ? "i32" : "f32";

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
        if (Number.isInteger(num)) {
            return `${num}.0`;
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
}

/**
 * @param {object} params
 * @param {string} params.name
 * @param {"identity"|"linear"|"log"|"pow"|"sqrt"|"symlog"|"band"} params.scale
 * @param {string} params.rawValueExpr
 * @param {"f32"|"u32"|"i32"} params.scalarType
 * @param {string} [params.argName]
 * @returns {string}
 */
function buildScaledFunction({
    name,
    scale,
    rawValueExpr,
    scalarType,
    argName = "_i",
}) {
    const floatExpr =
        scalarType === "f32" ? rawValueExpr : `f32(${rawValueExpr})`;

    const namePrefix = `fn ${SCALED_FUNCTION_PREFIX}${name}`;
    const fnName = `${namePrefix}(${argName}: u32) -> `;

    if (scale === "linear") {
        return `fn ${SCALED_FUNCTION_PREFIX}${name}(${argName}: u32) -> f32 {
  let v = ${floatExpr};
  return scaleLinear(v, params.${DOMAIN_PREFIX}${name}.xy, params.${RANGE_PREFIX}${name}.xy);
}`;
    }
    if (scale === "band") {
        const valueU32 =
            scalarType === "u32" ? rawValueExpr : `u32(f32(${rawValueExpr}))`;
        return `fn ${SCALED_FUNCTION_PREFIX}${name}(${argName}: u32) -> f32 {
  let v = ${valueU32};
  return scaleBand(
    v,
    params.${DOMAIN_PREFIX}${name}.xy,
    params.${RANGE_PREFIX}${name}.xy,
    params.${SCALE_PADDING_INNER_PREFIX}${name},
    params.${SCALE_PADDING_OUTER_PREFIX}${name},
    params.${SCALE_ALIGN_PREFIX}${name},
    params.${SCALE_BAND_PREFIX}${name}
  );
}`;
    }
    if (scale === "log") {
        return `fn ${SCALED_FUNCTION_PREFIX}${name}(${argName}: u32) -> f32 {
  let v = ${floatExpr};
  return scaleLog(v, params.${DOMAIN_PREFIX}${name}.xy, params.${RANGE_PREFIX}${name}.xy, params.${SCALE_BASE_PREFIX}${name});
}`;
    }
    if (scale === "pow" || scale === "sqrt") {
        return `fn ${SCALED_FUNCTION_PREFIX}${name}(${argName}: u32) -> f32 {
  let v = ${floatExpr};
  return scalePow(v, params.${DOMAIN_PREFIX}${name}.xy, params.${RANGE_PREFIX}${name}.xy, params.${SCALE_EXPONENT_PREFIX}${name});
}`;
    }
    if (scale === "symlog") {
        return `fn ${SCALED_FUNCTION_PREFIX}${name}(${argName}: u32) -> f32 {
  let v = ${floatExpr};
  return scaleSymlog(v, params.${DOMAIN_PREFIX}${name}.xy, params.${RANGE_PREFIX}${name}.xy, params.${SCALE_CONSTANT_PREFIX}${name});
}`;
    }

    return `${fnName}${scalarType} { return ${rawValueExpr}; }`;
}

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

        // getScaled_* is the only function mark shaders call. It hides whether
        // values come from buffers or uniforms and applies scale logic.
        const scale = channel.scale?.type ?? "identity";
        if (components === 1) {
            channelFns.push(
                buildScaledFunction({
                    name,
                    scale,
                    rawValueExpr: `read_${name}(i)`,
                    scalarType,
                    argName: "i",
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
        if (components === 1) {
            channelFns.push(
                buildScaledFunction({
                    name,
                    scale,
                    rawValueExpr,
                    scalarType,
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
