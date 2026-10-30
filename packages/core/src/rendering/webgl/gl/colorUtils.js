import { cssColorToRgba } from "../../color.js";
import { range } from "d3-array";
import { scheme as vegaScheme, interpolateColors } from "vega-scale";
import { isString, isArray, isFunction } from "vega-util";
import { peek } from "../../../utils/arrayUtils.js";
import { createOrUpdateTexture } from "./webGLHelper.js";

/**
 * @param {string | import("../../../spec/scale.js").SchemeParams} schemeParams
 * @param {WebGL2RenderingContext} gl
 * @param {number} [count]
 * @param {WebGLTexture} [existingTexture]
 * @param {boolean} [reverse]
 */
export function createSchemeTexture(
    schemeParams,
    gl,
    count,
    existingTexture,
    reverse = false
) {
    const schemeName = isString(schemeParams)
        ? schemeParams
        : schemeParams.name;
    const extent = (!isString(schemeParams) && schemeParams.extent) || [0, 1];

    if (count === undefined && !isString(schemeParams)) {
        count = schemeParams.count;
    }

    if (schemeName) {
        const scheme = vegaScheme(schemeName);
        if (isFunction(scheme)) {
            const textureData = interpolatorToTextureData(scheme, {
                extent,
                count,
                reverse,
            });
            return createOrUpdateTexture(
                gl,
                {
                    minMag: gl.LINEAR,
                    format: gl.RGBA,
                    height: 1,
                    wrap: gl.CLAMP_TO_EDGE,
                },
                textureData,
                existingTexture
            );
        } else if (isArray(scheme)) {
            return createDiscreteColorTexture(
                reverse ? Array.from(scheme).reverse() : scheme,
                gl,
                count,
                existingTexture
            );
        } else {
            throw new Error("Unknown scheme: " + schemeName);
        }
    }
}

/**
 * @param {string[]} colors
 * @param {import("../../../spec/scale.js").ScaleInterpolate | import("../../../spec/scale.js").ScaleInterpolateParams} interpolateParams
 * @param {WebGL2RenderingContext} gl
 * @param {WebGLTexture} [existingTexture]
 */
export function createInterpolatedColorTexture(
    colors,
    interpolateParams = "rgb",
    gl,
    existingTexture
) {
    const interpolator = interpolateColors(
        colors,
        isString(interpolateParams)
            ? interpolateParams
            : interpolateParams.type,
        isString(interpolateParams) ? undefined : interpolateParams.gamma
    );

    // TODO: Reverse
    const textureData = interpolatorToTextureData(interpolator);
    return createOrUpdateTexture(
        gl,
        {
            minMag: gl.LINEAR,
            format: gl.RGBA,
            height: 1,
            wrap: gl.CLAMP_TO_EDGE,
        },
        textureData,
        existingTexture
    );
}

/**
 * Creates a texture that maps integer indices to discrete 32bit floats.
 * The range may represent point shapes, for example.
 *
 * @param {number[]} range
 * @param {WebGL2RenderingContext} gl
 * @param {number} [count]
 * @param {WebGLTexture} [existingTexture]
 */
export function createDiscreteTexture(range, gl, count, existingTexture) {
    const size = Math.max(range.length, count || 0);
    const textureData = new Float32Array(size);

    for (let i = 0; i < size; i++) {
        textureData[i] = range[i % range.length];
    }

    return createOrUpdateTexture(
        gl,
        {
            minMag: gl.NEAREST,
            format: gl.RED,
            internalFormat: gl.R32F,
            height: 1,
        },
        textureData,
        existingTexture
    );
}

/**
 * Creates a texture that maps integer indices to discrete RGBA colors.
 *
 * @param {string[]} colors
 * @param {WebGL2RenderingContext} gl
 * @param {number} [count]
 * @param {WebGLTexture} [existingTexture]
 */
export function createDiscreteColorTexture(colors, gl, count, existingTexture) {
    const textureData = colorArrayToTextureData(colors, count);
    return createOrUpdateTexture(
        gl,
        {
            minMag: gl.NEAREST,
            format: gl.RGBA,
            height: 1,
        },
        textureData,
        existingTexture
    );
}

/**
 * Renders an interpolator to a texture, which can be used for mapping
 * quantitative values to colors (sequential scale).
 *
 * @param {function(number):string} interpolator
 * @param {object} options
 * @param {number[]} [options.extent]
 * @param {boolean} [options.reverse]
 * @param {number} [options.count]
 */
function interpolatorToTextureData(
    interpolator,
    { extent = [0, 1], reverse = false, count = 256 } = {}
) {
    const start = extent[0];
    const span = peek(extent) - start;

    const steps = range(count)
        .map((x) => x / (count - 1))
        .map((x) => start + x / span)
        .map(interpolator);

    if (reverse) {
        steps.reverse();
    }

    return colorArrayToTextureData(steps);
}

/**
 * Renders a scheme (an array of colors) to a texture.
 *
 * @param {string[]} scheme
 * @param {number} [count]
 */
function colorArrayToTextureData(scheme, count) {
    const size = Math.max(scheme.length, count || 0);

    const textureData = new Uint8Array(size * 4);
    for (let i = 0; i < size; i++) {
        const rgba = cssColorToRgba(scheme[i % scheme.length]);
        for (let j = 0; j < 4; j++) {
            textureData[i * 4 + j] = rgba[j] * 255;
        }
    }
    return textureData;
}
