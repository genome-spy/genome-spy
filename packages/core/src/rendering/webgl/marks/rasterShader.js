import { generateScaleGlsl } from "../gl/glslScaleGenerator.js";
import SCALES from "../gl/includes/scales.glsl";
import FRAGMENT from "./raster.fragment.glsl";

/**
 * @param {import("../../../marks/raster.js").default} mark
 * @returns {"uint" | "float"}
 */
export function rasterValueType(mark) {
    const { direct, type } = mark.getCellBinding();
    return direct || type !== "quantitative" ? "uint" : "float";
}

/**
 * @param {import("../../../marks/raster.js").default} mark
 * @param {import("../../../types/encoder.js").VegaScale | undefined} scale
 * @param {ReturnType<import("./rasterPaintShader.js").createRasterPaintShader>} [paint]
 */
export function rasterFragmentShader(mark, scale, paint) {
    const { channel } = mark.getCellBinding();
    const opacityField = channel === "opacity";
    const { domainUniform, domainUniformName, rangeUniform, glsl } =
        generateScaleGlsl(channel, scale, mark.encoding[channel]);
    const valueType = rasterValueType(mark);
    const integer = valueType === "uint";
    const log = ["log", "sequential-log"].includes(scale?.type);
    const clamped = log && "clamp" in scale && scale.clamp();
    /** @param {string} fallback */
    const checkValue = (fallback) => `
    if (isnan(value) || isinf(value)) return ${fallback};
    ${clamped ? `value = clampToRange(value, vec2(${domainUniformName}[0], ${domainUniformName}[${domainUniformName}.length() - 1]));` : ""}
    ${log ? `if (value == 0.0 || sign(value) != sign(${domainUniformName}[0])) return ${fallback};` : ""}`;
    const fallback = opacityField
        ? `
float cellOpacity(float value) {
    ${checkValue("0.0")}
    return clamp(scale_opacity(value), 0.0, 1.0);
}`
        : `
vec4 cellColor(${valueType} value) {
    ${integer ? "" : checkValue("vec4(0.0)")}
    return scale_color(value);
}`;

    return `
precision highp float;
precision highp int;
uniform highp ${integer ? "usampler2D" : "sampler2D"} uCells;
${SCALES}
${domainUniform ? "uniform " + domainUniform : ""}
${rangeUniform ?? ""}
${glsl}

${fallback}
${paint?.source ?? ""}

vec4 sampleCell(ivec2 cell) {
    ${valueType} value = texelFetch(uCells, cell, 0).r;
    vec4 color = ${paint?.hasColor ? "rasterColor(cell, value)" : "cellColor(value)"};
    ${paint?.hasOpacity ? "color.a *= rasterOpacity(cell, value);" : opacityField ? "color.a *= cellOpacity(value);" : ""}
    return vec4(color.rgb * color.a, color.a);
}
${FRAGMENT}`;
}
