/* global GPUBufferUsage, GPUMapMode */

import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("sparse GPU atlas preserves even-odd sign and dispatch bounds", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
        const { createSparseGpuPathAtlas } =
            await import("/src/symbols/sparseGpuPathAtlas.js");
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter.requestDevice();
        const atlas = createSparseGpuPathAtlas(
            device,
            [
                "M-1-1H1V1H-1Z",
                "M-1-1H1V1H-1ZM-.5-.5H.5V.5H-.5Z",
                "M-1-.7H.3V.7H-1ZM-.3-1H1V1H-.3Z",
                "M0-1A1 1 0 1 1 0 1A1 1 0 1 1 0-1Z",
            ],
            {
                tileSize: 64,
                spread: 12,
                shapePadding: 16,
                gutter: 1,
            }
        );
        await atlas.completion;

        const bytesPerRow = Math.ceil((atlas.width * 4) / 256) * 256;
        const readback = device.createBuffer({
            size: bytesPerRow * atlas.height,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        const encoder = device.createCommandEncoder();
        encoder.copyTextureToBuffer(
            { texture: atlas.texture },
            {
                buffer: readback,
                bytesPerRow,
                rowsPerImage: atlas.height,
            },
            [atlas.width, atlas.height]
        );
        device.queue.submit([encoder.finish()]);
        await readback.mapAsync(GPUMapMode.READ);
        const pixels = new Uint8Array(readback.getMappedRange());

        const medianAt = (x, y) => {
            const offset = y * bytesPerRow + x * 4;
            const r = pixels[offset];
            const g = pixels[offset + 1];
            const b = pixels[offset + 2];
            return Math.max(Math.min(r, g), Math.min(Math.max(r, g), b));
        };
        const hashPixels = (data) => {
            let hash = 2166136261;
            for (let y = 0; y < atlas.height; y++) {
                const rowOffset = y * bytesPerRow;
                for (let x = 0; x < atlas.width * 4; x++) {
                    hash ^= data[rowOffset + x];
                    hash = Math.imul(hash, 16777619);
                }
            }
            return hash >>> 0;
        };
        const slot = atlas.slotSize;
        const samples = {
            squareCenter: medianAt(33, 33),
            squareNearSide: medianAt(15, 33),
            squareNearCorner: medianAt(15, 15),
            squareOutside: medianAt(3, 3),
            holeCenter: medianAt(slot + 33, 33),
            holeRing: medianAt(slot + 46, 33),
            overlapCenter: medianAt(33, slot + 33),
            overlapArm: medianAt(22, slot + 33),
            overlapOutside: medianAt(3, slot + 3),
            curveCenter: medianAt(slot + 33, slot + 33),
            curveOutside: medianAt(slot + 3, slot + 3),
        };
        const firstHash = hashPixels(pixels);

        readback.unmap();
        readback.destroy();
        atlas.texture.destroy();

        const repeatedAtlas = createSparseGpuPathAtlas(
            device,
            [
                "M-1-1H1V1H-1Z",
                "M-1-1H1V1H-1ZM-.5-.5H.5V.5H-.5Z",
                "M-1-.7H.3V.7H-1ZM-.3-1H1V1H-.3Z",
                "M0-1A1 1 0 1 1 0 1A1 1 0 1 1 0-1Z",
            ],
            {
                tileSize: 64,
                spread: 12,
                shapePadding: 16,
                gutter: 1,
            }
        );
        await repeatedAtlas.completion;
        const repeatedReadback = device.createBuffer({
            size: bytesPerRow * repeatedAtlas.height,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        const repeatedEncoder = device.createCommandEncoder();
        repeatedEncoder.copyTextureToBuffer(
            { texture: repeatedAtlas.texture },
            {
                buffer: repeatedReadback,
                bytesPerRow,
                rowsPerImage: repeatedAtlas.height,
            },
            [repeatedAtlas.width, repeatedAtlas.height]
        );
        device.queue.submit([repeatedEncoder.finish()]);
        await repeatedReadback.mapAsync(GPUMapMode.READ);
        const repeatedPixels = new Uint8Array(
            repeatedReadback.getMappedRange()
        );
        const repeatedHash = hashPixels(repeatedPixels);
        repeatedReadback.unmap();
        repeatedReadback.destroy();
        repeatedAtlas.texture.destroy();
        device.destroy();
        return {
            width: atlas.width,
            height: atlas.height,
            samples,
            firstHash,
            repeatedHash,
        };
    });

    expect(result.width).toBe(132);
    expect(result.height).toBe(132);
    expect(result.samples.squareCenter).toBeGreaterThan(128);
    expect(result.samples.squareNearSide).toBeGreaterThan(96);
    expect(result.samples.squareNearSide).toBeLessThan(128);
    expect(
        Math.abs(
            result.samples.squareNearCorner - result.samples.squareNearSide
        )
    ).toBeLessThanOrEqual(2);
    expect(result.samples.squareOutside).toBeLessThan(128);
    expect(result.samples.holeCenter).toBeLessThan(128);
    expect(result.samples.holeRing).toBeGreaterThan(128);
    expect(result.samples.overlapCenter).toBeLessThan(128);
    expect(result.samples.overlapArm).toBeGreaterThan(128);
    expect(result.samples.overlapOutside).toBeLessThan(128);
    expect(result.samples.curveCenter).toBeGreaterThan(128);
    expect(result.samples.curveOutside).toBeLessThan(128);
    expect(result.repeatedHash).toBe(result.firstHash);
});

test("quadratic extrema do not create one-pixel sign streaks", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
        const { createSparseGpuPathAtlas } =
            await import("/src/symbols/sparseGpuPathAtlas.js");
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter.requestDevice();
        const atlas = createSparseGpuPathAtlas(
            device,
            ["M-1 0Q-.5-1 0-1Q.5-1 1 0Q.5 1 0 1Q-.5 1-1 0Z"],
            {
                tileSize: 64,
                spread: 12,
                shapePadding: 15.5,
                gutter: 1,
            }
        );
        await atlas.completion;
        const bytesPerRow = 512;
        const readback = device.createBuffer({
            size: bytesPerRow * atlas.height,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        const encoder = device.createCommandEncoder();
        encoder.copyTextureToBuffer(
            { texture: atlas.texture },
            {
                buffer: readback,
                bytesPerRow,
                rowsPerImage: atlas.height,
            },
            [atlas.width, atlas.height]
        );
        device.queue.submit([encoder.finish()]);
        await readback.mapAsync(GPUMapMode.READ);
        const pixels = new Uint8Array(readback.getMappedRange());
        const medianAt = (x, y) => {
            const offset = y * bytesPerRow + x * 4;
            const r = pixels[offset];
            const g = pixels[offset + 1];
            const b = pixels[offset + 2];
            return Math.max(Math.min(r, g), Math.min(Math.max(r, g), b));
        };
        const extremumRow = Array.from({ length: 8 }, (_, index) =>
            medianAt(24 + index, 16)
        );
        const interior = medianAt(33, 20);
        readback.unmap();
        readback.destroy();
        atlas.texture.destroy();
        device.destroy();
        return { extremumRow, interior };
    });

    expect(result.extremumRow.every((value) => value < 128)).toBe(true);
    expect(result.interior).toBeGreaterThan(128);
});
