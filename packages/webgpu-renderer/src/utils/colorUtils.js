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
        const color = d3color(colorString);
        if (!color) {
            throw new Error(
                `Invalid color "${colorString}" in the color ramp.`
            );
        }
        const rgb = color.rgb();
        const base = i * 4;
        data[base] = rgb.r;
        data[base + 1] = rgb.g;
        data[base + 2] = rgb.b;
        data[base + 3] = 255;
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
 * @param {string} color
 * @returns {number[]}
 */
export function cssColorToArray(color) {
    const rgb = d3color(color).rgb();
    return [rgb.r, rgb.g, rgb.b].map((x) => x / 255);
}
