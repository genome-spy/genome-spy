import { color as parseColor } from "d3-color";

/** @type {GPUColor} */
export const TRANSPARENT_GPU_COLOR = { r: 0, g: 0, b: 0, a: 0 };

/**
 * @param {string | null | undefined} background
 * @returns {GPUColor}
 */
export function toGpuColor(background) {
    if (background == null) {
        return TRANSPARENT_GPU_COLOR;
    }
    const parsed = parseColor(background);
    if (!parsed) {
        throw new Error(
            `Invalid WebGPU canvas background color: ${background}`
        );
    }
    const rgb = parsed.rgb();
    return {
        r: rgb.r / 255,
        g: rgb.g / 255,
        b: rgb.b / 255,
        a: rgb.opacity,
    };
}
