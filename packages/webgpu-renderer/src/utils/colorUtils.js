import { color as d3color } from "d3-color";
import { interpolateRgb } from "d3-interpolate";

/** @typedef {(t: number) => string} ColorInterpolatorFn */
/** @typedef {string | number[]} ColorStop */
/**
 * @typedef {object} TextureData
 * @property {GPUTextureFormat} format
 * @property {number} width
 * @property {number} height
 * @property {ArrayBufferView} data
 */

/**
 * Sample an interpolated color ramp for GPU upload.
 *
 * @param {ColorStop[] | ColorInterpolatorFn} scheme
 * @param {{ count?: number, interpolate?: import("../index.d.ts").ColorInterpolatorFactory }} [options]
 * @returns {TextureData}
 */
export function createSchemeTexture(scheme, { count = 256, interpolate } = {}) {
    const interpolator =
        typeof scheme === "function"
            ? scheme
            : createColorInterpolator(scheme, interpolate);
    const data = new Uint8Array(count * 4);
    for (let i = 0; i < count; i++) {
        const colorString = interpolator(count > 1 ? i / (count - 1) : 0);
        const rgba = cssColorToRgba(colorString);
        const base = i * 4;
        for (let j = 0; j < 4; j++) {
            data[base + j] = rgba[j] * 255;
        }
    }
    return { data, format: "rgba8unorm", width: count, height: 1 };
}

/**
 * @param {ColorStop} stop
 * @returns {string}
 */
function normalizeColorStop(stop) {
    if (typeof stop === "string") {
        return stop;
    }
    if (!Array.isArray(stop)) {
        throw new Error(`Invalid color stop: ${String(stop)}`);
    }
    const [rRaw = 0, gRaw = 0, bRaw = 0, aRaw = 1] = stop;
    const max = Math.max(rRaw, gRaw, bRaw, aRaw);
    const scale = max <= 1 ? 255 : 1;
    const alpha = max <= 1 ? aRaw : aRaw / 255;
    return `rgba(${rRaw * scale}, ${gRaw * scale}, ${bRaw * scale}, ${alpha})`;
}

/**
 * @param {ColorStop[]} colors
 * @param {import("../index.d.ts").ColorInterpolatorFactory | undefined} interpolate
 * @returns {ColorInterpolatorFn}
 */
function createColorInterpolator(colors, interpolate) {
    const stops = colors.map(normalizeColorStop);
    const factory = interpolate ?? interpolateRgb;
    const segments = stops
        .slice(0, -1)
        .map((stop, index) => factory(stop, stops[index + 1]));

    return (t) => {
        const scaled = t * segments.length;
        const segment = Math.max(
            0,
            Math.min(segments.length - 1, Math.floor(scaled))
        );
        return segments[segment](scaled - segment);
    };
}

/**
 * d3-color uses NaN RGB for zero-alpha CSS colors. Normalize them before
 * uploading scale resources, and retain straight alpha for mark compositing.
 *
 * @param {string} color
 * @returns {[number, number, number, number]}
 */
export function cssColorToRgba(color) {
    const parsed = d3color(color);
    if (!parsed) {
        throw new Error("Invalid color: " + color);
    }
    const rgb = parsed.rgb();
    const alpha = Math.max(0, Math.min(1, rgb.opacity));
    return alpha === 0
        ? [0, 0, 0, 0]
        : [rgb.r / 255, rgb.g / 255, rgb.b / 255, alpha];
}
