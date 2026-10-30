import { cssColorToRgba } from "../color.js";

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
    try {
        const [r, g, b, a] = cssColorToRgba(background);
        return { r, g, b, a };
    } catch {
        throw new Error(
            `Invalid WebGPU canvas background color: ${background}`
        );
    }
}
