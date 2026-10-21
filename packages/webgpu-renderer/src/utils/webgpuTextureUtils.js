/**
 * @typedef {object} TextureData
 * @prop {GPUTextureFormat} format
 * @prop {number} width
 * @prop {number} height
 * @prop {ArrayBufferView} data
 */

const DEFAULT_TEXTURE_USAGE =
    (globalThis.GPUTextureUsage?.TEXTURE_BINDING ?? 0) |
    (globalThis.GPUTextureUsage?.COPY_DST ?? 0);

/**
 * Create a GPUTexture and upload data in one step.
 *
 * @param {GPUDevice} device
 * @param {TextureData} textureData
 * @param {GPUTextureUsageFlags} [usage]
 * @param {string} [label]
 * @returns {GPUTexture}
 */
export function createTextureFromData(
    device,
    textureData,
    usage = DEFAULT_TEXTURE_USAGE,
    label
) {
    const texture = device.createTexture({
        label,
        size: {
            width: textureData.width,
            height: textureData.height,
            depthOrArrayLayers: 1,
        },
        format: textureData.format,
        usage,
    });

    writeTextureData(device, texture, textureData);
    return texture;
}

/**
 * Upload texture data to an existing texture.
 *
 * @param {GPUDevice} device
 * @param {GPUTexture} texture
 * @param {TextureData} textureData
 * @returns {void}
 */
export function writeTextureData(device, texture, textureData) {
    device.queue.writeTexture(
        { texture },
        asGpuBufferSource(textureData.data),
        {
            bytesPerRow:
                textureData.width * bytesPerPixelForFormat(textureData.format),
            rowsPerImage: textureData.height,
        },
        {
            width: textureData.width,
            height: textureData.height,
            depthOrArrayLayers: 1,
        }
    );
}

/**
 * Mark an ArrayBuffer-backed view as safe for a WebGPU upload.
 *
 * @param {ArrayBufferView} data
 * @returns {AllowSharedBufferSource}
 */
export function asGpuBufferSource(data) {
    return /** @type {AllowSharedBufferSource} */ (
        /** @type {unknown} */ (data)
    );
}

/**
 * @param {GPUTextureFormat} format
 * @returns {number}
 */
function bytesPerPixelForFormat(format) {
    switch (format) {
        case "r8uint":
            return 1;
        case "r32float":
            return 4;
        case "rg32float":
            return 8;
        case "rgba8unorm":
        case "rgba8unorm-srgb":
            return 4;
        case "rgba16float":
            return 8;
        default:
            return 4;
    }
}
