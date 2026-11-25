import { cssColorToRgba } from "../../color.js";
import { range } from "d3-array";
import { interpolateColors } from "vega-scale";
import { isString } from "vega-util";
import { createOrUpdateTexture } from "./webGLHelper.js";

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

    return createColorInterpolatorTexture(interpolator, gl, existingTexture);
}

/**
 * @param {(position: number) => string} interpolator
 * @param {WebGL2RenderingContext} gl
 * @param {WebGLTexture} [existingTexture]
 * @param {number} [count]
 */
export function createColorInterpolatorTexture(
    interpolator,
    gl,
    existingTexture,
    count = 256
) {
    const colors = range(count).map((i) => interpolator(i / (count - 1)));
    return createOrUpdateTexture(
        gl,
        {
            minMag: gl.LINEAR,
            format: gl.RGBA,
            height: 1,
            wrap: gl.CLAMP_TO_EDGE,
        },
        colorArrayToTextureData(colors),
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
