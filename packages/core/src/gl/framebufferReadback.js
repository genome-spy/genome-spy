/**
 * @typedef {object} FramebufferReadbackOptions
 * @prop {number} [x] Left edge in top-left-origin framebuffer pixels.
 * @prop {number} [y] Top edge in top-left-origin framebuffer pixels.
 * @prop {number} [width]
 * @prop {number} [height]
 * @prop {boolean} [unpremultiplyAlpha]
 */

/**
 * Reads a framebuffer rectangle into top-left-origin RGBA pixels.
 *
 * @param {WebGL2RenderingContext} gl
 * @param {import("twgl.js").FramebufferInfo} framebufferInfo
 * @param {FramebufferReadbackOptions} [options]
 * @returns {{pixels: Uint8ClampedArray, width: number, height: number}}
 */
export function readFramebufferPixels(gl, framebufferInfo, options = {}) {
    const x = options.x ?? 0;
    const y = options.y ?? 0;
    const width = options.width ?? framebufferInfo.width;
    const height = options.height ?? framebufferInfo.height;

    validateReadbackBounds(framebufferInfo, x, y, width, height);

    const source = new Uint8Array(width * height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebufferInfo.framebuffer);
    try {
        gl.readPixels(
            x,
            framebufferInfo.height - y - height,
            width,
            height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            source
        );
    } finally {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    return {
        pixels: flipRgbaPixels(
            source,
            width,
            height,
            options.unpremultiplyAlpha ?? false
        ),
        width,
        height,
    };
}

/**
 * Encodes a framebuffer rectangle as a data URL.
 *
 * @param {WebGL2RenderingContext} gl
 * @param {import("twgl.js").FramebufferInfo} framebufferInfo
 * @param {string} [type]
 * @param {FramebufferReadbackOptions} [options]
 */
export function framebufferToDataUrl(
    gl,
    framebufferInfo,
    type = "image/png",
    options = {}
) {
    return framebufferToCanvas(gl, framebufferInfo, options).toDataURL(type);
}

/**
 * Encodes a framebuffer rectangle as a Blob.
 *
 * @param {WebGL2RenderingContext} gl
 * @param {import("twgl.js").FramebufferInfo} framebufferInfo
 * @param {string} [type]
 * @param {FramebufferReadbackOptions} [options]
 * @returns {Promise<Blob>}
 */
export function framebufferToBlob(
    gl,
    framebufferInfo,
    type = "image/png",
    options = {}
) {
    const canvas = framebufferToCanvas(gl, framebufferInfo, options);

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error(`Could not encode framebuffer as ${type}.`));
            }
        }, type);
    });
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {import("twgl.js").FramebufferInfo} framebufferInfo
 * @param {FramebufferReadbackOptions} options
 */
function framebufferToCanvas(gl, framebufferInfo, options) {
    const { pixels, width, height } = readFramebufferPixels(
        gl,
        framebufferInfo,
        options
    );
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = width;
    exportCanvas.height = height;
    const ctx = /** @type {CanvasRenderingContext2D} */ (
        exportCanvas.getContext("2d")
    );
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(pixels);
    ctx.putImageData(imageData, 0, 0);

    return exportCanvas;
}

/**
 * Flips bottom-up WebGL pixels and optionally converts premultiplied RGB to
 * the straight-alpha representation expected by ImageData and PNG encoders.
 *
 * @param {Uint8Array} source
 * @param {number} width
 * @param {number} height
 * @param {boolean} unpremultiplyAlpha
 */
export function flipRgbaPixels(source, width, height, unpremultiplyAlpha) {
    const target = new Uint8ClampedArray(source.length);
    const rowLength = width * 4;

    for (let y = 0; y < height; y++) {
        const sourceRow = (height - y - 1) * rowLength;
        const targetRow = y * rowLength;
        target.set(
            source.subarray(sourceRow, sourceRow + rowLength),
            targetRow
        );
    }

    if (unpremultiplyAlpha) {
        for (let offset = 0; offset < target.length; offset += 4) {
            const alpha = target[offset + 3];
            if (alpha == 0) {
                target[offset] = 0;
                target[offset + 1] = 0;
                target[offset + 2] = 0;
            } else if (alpha < 255) {
                const factor = 255 / alpha;
                target[offset] = Math.round(target[offset] * factor);
                target[offset + 1] = Math.round(target[offset + 1] * factor);
                target[offset + 2] = Math.round(target[offset + 2] * factor);
            }
        }
    }

    return target;
}

/**
 * @param {{width: number, height: number}} framebufferInfo
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 */
function validateReadbackBounds(framebufferInfo, x, y, width, height) {
    if (![x, y, width, height].every(Number.isInteger)) {
        throw new RangeError("Framebuffer readback bounds must be integers.");
    }
    if (
        x < 0 ||
        y < 0 ||
        width <= 0 ||
        height <= 0 ||
        x + width > framebufferInfo.width ||
        y + height > framebufferInfo.height
    ) {
        throw new RangeError("Framebuffer readback bounds are out of range.");
    }
}
