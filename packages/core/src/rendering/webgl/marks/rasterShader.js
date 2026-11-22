import { generateScaleGlsl } from "../gl/glslScaleGenerator.js";
import SCALES from "../gl/includes/scales.glsl";
import FRAGMENT from "./raster.fragment.glsl";

/**
 * @param {import("../../../marks/raster.js").default} mark
 * @param {import("../../../types/encoder.js").VegaScale} [scale]
 */
export function rasterFragmentShader(mark, scale) {
    const { domainUniform, glsl } = generateScaleGlsl(
        "color",
        scale,
        mark.encoding.color
    );
    const integer =
        !scale || mark.getColorCellBinding().type !== "quantitative";
    const opacity = !!mark.getCellOpacityReader();
    const log = ["log", "sequential-log"].includes(scale?.type);
    const clamped = log && "clamp" in scale && scale.clamp();
    const color = integer
        ? "return scale_color(texelFetch(uCells, cell, 0).r);"
        : `
    float value = texelFetch(uCells, cell, 0).r;
    if (isnan(value) || isinf(value)) return vec4(0.0);
    ${clamped ? "value = clampToRange(value, vec2(uDomain_color[0], uDomain_color[uDomain_color.length() - 1]));" : ""}
    ${log ? "if (sign(value) != sign(uDomain_color[0]) || value == 0.0) return vec4(0.0);" : ""}
    return scale_color(value);`;

    return `
precision highp float;
precision highp int;
uniform highp ${integer ? "usampler2D" : "sampler2D"} uCells;
${SCALES}
${opacity ? "#define RASTER_CELL_OPACITY\nuniform highp sampler2D uCellOpacity;" : ""}
${domainUniform ? "uniform " + domainUniform : ""}
${glsl}

vec4 cellColor(ivec2 cell) {
    ${color}
}
${FRAGMENT}`;
}
