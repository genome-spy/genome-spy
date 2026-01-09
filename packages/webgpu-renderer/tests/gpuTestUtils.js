import { test } from "@playwright/test";
import { UniformBuffer } from "../src/utils/uniformBuffer.js";

/**
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
export async function ensureWebGPU(page) {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const status = await page.evaluate(async () => {
        const hasGPU = !!navigator.gpu;
        let adapterAvailable = false;
        if (hasGPU) {
            const adapter = await navigator.gpu.requestAdapter();
            adapterAvailable = !!adapter;
        }
        return {
            hasGPU,
            adapterAvailable,
            isSecureContext,
            userAgent: navigator.userAgent,
            platform: navigator.platform,
        };
    });

    if (!status.hasGPU) {
        test.skip(true, `WebGPU is not available: ${JSON.stringify(status)}`);
    }
    if (!status.adapterAvailable) {
        test.skip(
            true,
            `WebGPU adapter is not available: ${JSON.stringify(status)}`
        );
    }
}

/**
 * @param {import("../src/utils/uniformBuffer.js").UniformSpec[]} layout
 * @param {Record<string, number|number[]|Array<number|number[]>>} values
 * @returns {number[]}
 */
export function buildUniformData(layout, values) {
    const buffer = new UniformBuffer(layout);
    for (const [name, value] of Object.entries(values)) {
        buffer.setValue(name, value);
    }
    return Array.from(new Float32Array(buffer.data));
}

/**
 * @param {string} format
 * @returns {number}
 */
function bytesPerPixelForFormat(format) {
    switch (format) {
        case "rgba8unorm":
        case "rgba8unorm-srgb":
            return 4;
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

/**
 * @param {import("../src/utils/colorUtils.js").TextureData} textureData
 * @returns {{ format: string, width: number, height: number, bytesPerRow: number, data: number[] }}
 */
export function packTextureData(textureData) {
    const bytesPerPixel = bytesPerPixelForFormat(textureData.format);
    const unpaddedBytesPerRow = textureData.width * bytesPerPixel;
    const bytesPerRow = alignTo(unpaddedBytesPerRow, 256);
    const rowCount = Math.max(1, textureData.height);
    const source = new Uint8Array(
        textureData.data.buffer,
        textureData.data.byteOffset,
        textureData.data.byteLength
    );

    if (bytesPerRow === unpaddedBytesPerRow) {
        return {
            format: textureData.format,
            width: textureData.width,
            height: textureData.height,
            bytesPerRow,
            data: Array.from(source),
        };
    }

    const padded = new Uint8Array(bytesPerRow * rowCount);
    for (let row = 0; row < rowCount; row++) {
        const srcOffset = row * unpaddedBytesPerRow;
        const destOffset = row * bytesPerRow;
        padded.set(
            source.subarray(srcOffset, srcOffset + unpaddedBytesPerRow),
            destOffset
        );
    }

    return {
        format: textureData.format,
        width: textureData.width,
        height: textureData.height,
        bytesPerRow,
        data: Array.from(padded),
    };
}
