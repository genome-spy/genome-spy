import { color as d3color } from "d3-color";
/**
 * @typedef {(t: number) => string} ColorInterpolator
 * @typedef {string[] | ColorInterpolator} ColorScheme
 *
 * @typedef {object} SchemeParams
 * @prop {ColorScheme} scheme
 * @prop {[number, number]} [extent]
 * @prop {boolean} [reverse]
 * @prop {number} [count]
 * @prop {"discrete"|"interpolate"} [mode]
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
        if (params.mode === "interpolate") {
            return createInterpolatedColorTexture(params.scheme, params);
        }
        return createDiscreteColorTexture(params.scheme, params.count);
    }

    return undefined;
}

/**
 * Creates an interpolated color texture from color stops.
 *
 * @param {string[]} colors
 * @param {{ extent?: [number, number], reverse?: boolean, count?: number }} [options]
 * @returns {TextureData}
 */
export function createInterpolatedColorTexture(colors, options = {}) {
    const interpolator = createRgbInterpolator(colors);
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
 * @param {string[]} colors
 * @param {number} [count]
 * @returns {TextureData}
 */
export function createDiscreteColorTexture(colors, count) {
    return colorArrayToTextureData(colors, count);
}

/**
 * Renders an interpolator to a texture, which can be used for mapping
 * quantitative values to colors (sequential scale).
 *
 * @param {ColorInterpolator} interpolator
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
 * @param {string[]} colors
 * @returns {ColorInterpolator}
 */
function createRgbInterpolator(colors) {
    const stops = colors.map((colorString) => {
        const color = d3color(colorString);
        if (!color) {
            throw new Error(`Invalid color "${colorString}" in stops`);
        }
        const rgb = color.rgb();
        return { r: rgb.r, g: rgb.g, b: rgb.b };
    });

    return (t) => {
        const clamped = Math.min(1, Math.max(0, t));
        const scaled = clamped * (stops.length - 1);
        const index = Math.min(stops.length - 2, Math.floor(scaled));
        const local = scaled - index;
        const a = stops[index];
        const b = stops[index + 1];
        const r = a.r + (b.r - a.r) * local;
        const g = a.g + (b.g - a.g) * local;
        const bValue = a.b + (b.b - a.b) * local;
        return `rgb(${r}, ${g}, ${bValue})`;
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
