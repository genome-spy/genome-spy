import { color as d3color } from "d3-color";
import { interpolateRgb, piecewise } from "d3-interpolate";
/**
 * @typedef {(t: number) => string} ColorInterpolatorFn
 * @typedef {string | number[]} ColorStop
 * @typedef {ColorStop[] | ColorInterpolatorFn} ColorScheme
 *
 * @typedef {object} SchemeParams
 * @prop {ColorScheme} scheme
 * @prop {[number, number]} [extent]
 * @prop {boolean} [reverse]
 * @prop {number} [count]
 * @prop {"discrete"|"interpolate"} [mode]
 * @prop {import("../index.d.ts").ColorInterpolatorFactory} [interpolate]
 *
 * @typedef {object} TextureData
 * @prop {GPUTextureFormat} format
 * @prop {number} width
 * @prop {number} height
 * @prop {ArrayBufferView} data
 */

/**
 * Create a texture from either a discrete scheme (array) or interpolator function.
 *
 * @param {ColorScheme | SchemeParams} schemeParams
 * @param {number} [count]
 * @returns {TextureData | undefined}
 */
export function createSchemeTexture(schemeParams, count) {
    const params =
        typeof schemeParams === "function" || Array.isArray(schemeParams)
            ? { scheme: schemeParams }
            : schemeParams;

    if (params.count === undefined && count !== undefined) {
        params.count = count;
    }

    if (typeof params.scheme === "function") {
        return interpolatorToTextureData(params.scheme, params);
    }

    if (Array.isArray(params.scheme)) {
        if (params.mode === "interpolate" || params.interpolate) {
            return createInterpolatedColorTexture(params.scheme, params);
        }
        return createDiscreteColorTexture(params.scheme, params.count);
    }

    return undefined;
}

/**
 * Creates an interpolated color texture from color stops.
 *
 * @param {ColorStop[]} colors
 * @param {{ extent?: [number, number], reverse?: boolean, count?: number, interpolate?: import("../index.d.ts").ColorInterpolatorFactory }} [options]
 * @returns {TextureData}
 */
export function createInterpolatedColorTexture(colors, options = {}) {
    const interpolator = createColorInterpolator(colors, options.interpolate);
    return interpolatorToTextureData(interpolator, options);
}

/**
 * Creates a texture that maps integer indices to discrete 32bit integers.
 * The range may represent point shapes, for example.
 *
 * @param {number[]} range
 * @param {number} [count]
 * @returns {TextureData}
 */
export function createDiscreteTexture(range, count) {
    const size = Math.max(range.length, count || 0);
    const textureData = new Uint32Array(size);

    for (let i = 0; i < size; i++) {
        textureData[i] = range[i % range.length];
    }

    return {
        data: textureData,
        format: "r32uint",
        width: size,
        height: 1,
    };
}

/**
 * Creates a texture that maps integer indices to discrete RGB colors.
 *
 * @param {ColorStop[]} colors
 * @param {number} [count]
 * @returns {TextureData}
 */
export function createDiscreteColorTexture(colors, count) {
    const normalized = colors.map(normalizeColorStop);
    return colorArrayToTextureData(normalized, count);
}

/**
 * Renders an interpolator to a texture, which can be used for mapping
 * quantitative values to colors (sequential scale).
 *
 * @param {ColorInterpolatorFn} interpolator
 * @param {object} options
 * @param {[number, number]} [options.extent]
 * @param {boolean} [options.reverse]
 * @param {number} [options.count]
 * @returns {TextureData}
 */
function interpolatorToTextureData(
    interpolator,
    { extent = [0, 1], reverse = false, count = 256 } = {}
) {
    const start = extent[0];
    const span = extent[extent.length - 1] - start;
    const denom = span === 0 ? 1 : span;
    const colors = new Array(count);

    for (let i = 0; i < count; i++) {
        const t = count > 1 ? i / (count - 1) : 0;
        const v = start + t / denom;
        colors[i] = interpolator(v);
    }

    if (reverse) {
        colors.reverse();
    }

    return colorArrayToTextureData(colors);
}

/**
 * Renders a scheme (an array of colors) to a texture.
 *
 * @param {string[]} scheme
 * @param {number} [count]
 * @returns {TextureData}
 */
function colorArrayToTextureData(scheme, count) {
    const size = Math.max(scheme.length, count || 0);

    const textureData = new Uint8Array(size * 4);
    for (let i = 0; i < size; i++) {
        const colorString = scheme[i % scheme.length];
        const color = d3color(colorString);
        if (!color) {
            throw new Error(
                `Invalid color "${colorString}" in the scheme ${JSON.stringify(scheme)}!`
            );
        }
        const rgb = color.rgb();
        const base = i * 4;
        textureData[base] = rgb.r;
        textureData[base + 1] = rgb.g;
        textureData[base + 2] = rgb.b;
        textureData[base + 3] = 255;
    }
    return {
        data: textureData,
        format: "rgba8unorm",
        width: size,
        height: 1,
    };
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
 * @param {import("../index.d.ts").ColorInterpolatorFactory | undefined} interpolate
 * @returns {(a: string, b: string) => ColorInterpolatorFn}
 */
function getInterpolatorFactory(interpolate) {
    return interpolate ?? interpolateRgb;
}

/**
 * @param {ColorStop[]} colors
 * @param {import("../index.d.ts").ColorInterpolatorFactory | undefined} interpolate
 * @returns {ColorInterpolatorFn}
 */
function createColorInterpolator(colors, interpolate) {
    const stops = colors.map(normalizeColorStop);
    const factory = getInterpolatorFactory(interpolate);
    return piecewise(factory, stops);
}

/**
 * @param {string} color
 * @returns {number[]}
 */
export function cssColorToArray(color) {
    const rgb = d3color(color).rgb();
    return [rgb.r, rgb.g, rgb.b].map((x) => x / 255);
}
