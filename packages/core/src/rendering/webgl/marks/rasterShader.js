import { generateScaleGlsl } from "../gl/glslScaleGenerator.js";
import SCALES from "../gl/includes/scales.glsl";
import FRAGMENT from "./raster.fragment.glsl";

/**
 * @param {import("../../../marks/raster.js").default} mark
 * @param {import("../../../types/encoder.js").VegaScale} scale
 */
export function rasterFragmentShader(mark, scale) {
    const { domainUniform, glsl } = generateScaleGlsl(
        "color",
        scale,
        mark.encoding.color
    );
    const categorical = mark.getColorCellBinding().type !== "quantitative";
    const brush = !!mark.getCellOpacityReader();
    const log = ["log", "sequential-log"].includes(scale.type);
    const clamped = log && "clamp" in scale && scale.clamp();
    const color = categorical
        ? "return scale_color(texelFetch(uCells, cell, 0).r);"
        : `
    float value = texelFetch(uCells, cell, 0).r;
    if (isnan(value) || isinf(value)) return vec4(0.0);
    ${brush ? "float rawValue = value;" : ""}
    ${clamped ? "value = clampToRange(value, vec2(uDomain_color[0], uDomain_color[uDomain_color.length() - 1]));" : ""}
    ${log ? "if (sign(value) != sign(uDomain_color[0]) || value == 0.0) return vec4(0.0);" : ""}
    vec4 color = scale_color(value);
    ${brush ? "color.a *= uBrush.x <= rawValue && rawValue < uBrush.y ? uBrush.z : uBrush.w;" : ""}
    return color;`;

    return `
precision highp float;
precision highp int;
uniform highp ${categorical ? "usampler2D" : "sampler2D"} uCells;
${SCALES}
${brush ? "uniform vec4 uBrush;" : ""}
${domainUniform ? "uniform " + domainUniform : ""}
${glsl}

vec4 cellColor(ivec2 cell) {
    ${color}
}
${FRAGMENT}`;
}
