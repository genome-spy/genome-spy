import { generateScaleGlsl } from "../gl/glslScaleGenerator.js";
import SCALES from "../gl/includes/scales.glsl";
import FRAGMENT from "./raster.fragment.glsl";

/**
 * @param {import("../../../marks/raster.js").default} mark
 * @param {import("../../../types/encoder.js").VegaScale} [scale]
 * @returns {"uint" | "float"}
 */
export function rasterValueType(mark, scale) {
    return !scale || mark.getColorCellBinding().type !== "quantitative"
        ? "uint"
        : "float";
}

/**
 * @param {import("../../../marks/raster.js").default} mark
 * @param {import("../../../types/encoder.js").VegaScale | undefined} scale
 * @param {string} [opacity]
 */
export function rasterFragmentShader(mark, scale, opacity) {
    const { domainUniform, glsl } = generateScaleGlsl(
        "color",
        scale,
        mark.encoding.color
    );
    const valueType = rasterValueType(mark, scale);
    const integer = valueType === "uint";
    const log = ["log", "sequential-log"].includes(scale?.type);
    const clamped = log && "clamp" in scale && scale.clamp();
    const color = integer
        ? "return scale_color(value);"
        : `
    if (isnan(value) || isinf(value)) return vec4(0.0);
    ${clamped ? "value = clampToRange(value, vec2(uDomain_color[0], uDomain_color[uDomain_color.length() - 1]));" : ""}
    ${log ? "if (sign(value) != sign(uDomain_color[0]) || value == 0.0) return vec4(0.0);" : ""}
    return scale_color(value);`;

    return `
precision highp float;
precision highp int;
uniform highp ${integer ? "usampler2D" : "sampler2D"} uCells;
${SCALES}
${opacity ?? ""}
${domainUniform ? "uniform " + domainUniform : ""}
${glsl}

vec4 cellColor(${valueType} value) {
    ${color}
}

vec4 sampleCell(ivec2 cell) {
    ${valueType} value = texelFetch(uCells, cell, 0).r;
    vec4 color = cellColor(value);
    ${opacity ? "color.a *= rasterOpacity(cell, value);" : ""}
    return vec4(color.rgb * color.a, color.a);
}
${FRAGMENT}`;
}
