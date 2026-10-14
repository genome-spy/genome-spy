import { expect, it, vi } from "vitest";
import { writeTextureData } from "./webgpuTextureUtils.js";

it.each([
    ["rgba8unorm", 3, 12],
    ["r8uint", 5, 5],
])("uploads unpadded %s rows", (format, width, bytesPerRow) => {
    const writeTexture = vi.fn();
    const device = /** @type {GPUDevice} */ (
        /** @type {unknown} */ ({ queue: { writeTexture } })
    );
    const texture = /** @type {GPUTexture} */ ({});
    const data = new Uint8Array(bytesPerRow * 2);

    writeTextureData(device, texture, {
        format: /** @type {GPUTextureFormat} */ (format),
        width,
        height: 2,
        data,
    });

    expect(writeTexture).toHaveBeenCalledWith(
        { texture },
        data,
        { bytesPerRow, rowsPerImage: 2 },
        { width, height: 2, depthOrArrayLayers: 1 }
    );
});
