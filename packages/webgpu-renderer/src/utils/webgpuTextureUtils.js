/* global globalThis */
/**
 * @typedef {object} TextureData
 * @prop {GPUTextureFormat} format
 * @prop {number} width
 * @prop {number} height
 * @prop {ArrayBufferView} data
 */

/**
 * @typedef {TextureData & { bytesPerRow: number }} TextureWriteData
 */

const DEFAULT_TEXTURE_USAGE =
    (globalThis.GPUTextureUsage?.TEXTURE_BINDING ?? 0) |
    (globalThis.GPUTextureUsage?.COPY_DST ?? 0);

/**
 * Prepare texture data for GPU writes by applying WebGPU row alignment.
 *
 * @param {TextureData} textureData
 * @returns {TextureWriteData}
 */
export function prepareTextureData(textureData) {
    const bytesPerPixel = bytesPerPixelForFormat(textureData.format);
    const unpaddedBytesPerRow = textureData.width * bytesPerPixel;
    const bytesPerRow = alignTo(unpaddedBytesPerRow, 256);

    if (bytesPerRow === unpaddedBytesPerRow) {
        return {
            ...textureData,
            bytesPerRow,
        };
    }

    const rowCount = Math.max(1, textureData.height);
    const padded = new Uint8Array(bytesPerRow * rowCount);
    const source = new Uint8Array(
        textureData.data.buffer,
        textureData.data.byteOffset,
        textureData.data.byteLength
    );

    for (let row = 0; row < rowCount; row++) {
        const srcOffset = row * unpaddedBytesPerRow;
        const destOffset = row * bytesPerRow;
        padded.set(
            source.subarray(srcOffset, srcOffset + unpaddedBytesPerRow),
            destOffset
        );
    }

    return {
        ...textureData,
        data: padded,
        bytesPerRow,
    };
}

/**
 * Create a GPUTexture and upload data in one step.
 *
 * @param {GPUDevice} device
 * @param {TextureData} textureData
 * @param {GPUTextureUsageFlags} [usage]
 * @returns {GPUTexture}
 */
export function createTextureFromData(
    device,
    textureData,
    usage = DEFAULT_TEXTURE_USAGE
) {
    const texture = device.createTexture({
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
    const writeData = prepareTextureData(textureData);
    device.queue.writeTexture(
        { texture },
        writeData.data,
        {
            bytesPerRow: writeData.bytesPerRow,
            rowsPerImage: writeData.height,
        },
        {
            width: writeData.width,
            height: writeData.height,
            depthOrArrayLayers: 1,
        }
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

/**
 * @param {number} value
 * @param {number} alignment
 * @returns {number}
 */
function alignTo(value, alignment) {
    return Math.ceil(value / alignment) * alignment;
}
