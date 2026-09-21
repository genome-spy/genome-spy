/* global GPUBufferUsage, GPUMapMode */

import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("sparse GPU atlas preserves even-odd sign and dispatch bounds", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
        const { createSparseGpuPathAtlas } =
            await import("/tests/oracles/createSparseGpuPathAtlas.js");
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

        const bytesPerRow = Math.ceil((atlas.width * 8) / 256) * 256;
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
        const words = new Uint16Array(
            pixels.buffer,
            pixels.byteOffset,
            pixels.byteLength / 2
        );
        const halfToFloat = (value) => {
            const sign = value & 0x8000 ? -1 : 1;
            const exponent = (value >> 10) & 0x1f;
            const fraction = value & 0x03ff;
            if (exponent === 0) {
                return sign * 2 ** -14 * (fraction / 1024);
            }
            if (exponent === 0x1f) {
                return fraction ? Number.NaN : sign * Number.POSITIVE_INFINITY;
            }
            return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
        };
        const encodeDistance = (value) =>
            Math.round(Math.max(0, Math.min(1, 0.5 + value / 24)) * 255);

        const medianAt = (x, y) => {
            const offset = (y * bytesPerRow) / 2 + x * 4;
            const r = encodeDistance(halfToFloat(words[offset]));
            const g = encodeDistance(halfToFloat(words[offset + 1]));
            const b = encodeDistance(halfToFloat(words[offset + 2]));
            return Math.max(Math.min(r, g), Math.min(Math.max(r, g), b));
        };
        const hashPixels = (data) => {
            let hash = 2166136261;
            for (let y = 0; y < atlas.height; y++) {
                const rowOffset = y * bytesPerRow;
                for (let x = 0; x < atlas.width * 8; x++) {
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

test("GPU atlas stores regular signed distance in alpha", async ({ page }) => {
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
        const { createSparseGpuPathAtlas } =
            await import("/tests/oracles/createSparseGpuPathAtlas.js");
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter.requestDevice();
        const options = {
            tileSize: 32,
            spread: 8,
            shapePadding: 10,
            gutter: 1,
        };

        const halfToFloat = (value) => {
            const sign = value & 0x8000 ? -1 : 1;
            const exponent = (value >> 10) & 0x1f;
            const fraction = value & 0x03ff;
            if (exponent === 0) {
                return sign * 2 ** -14 * (fraction / 1024);
            }
            if (exponent === 0x1f) {
                return fraction ? Number.NaN : sign * Number.POSITIVE_INFINITY;
            }
            return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
        };

        const readSamples = async () => {
            const atlas = createSparseGpuPathAtlas(device, ["M-1-1H1V1H-1Z"], {
                ...options,
            });
            await atlas.completion;
            const bytesPerRow = Math.ceil((atlas.width * 8) / 256) * 256;
            const readback = device.createBuffer({
                size: bytesPerRow * atlas.height,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            const encoder = device.createCommandEncoder();
            encoder.copyTextureToBuffer(
                { texture: atlas.texture },
                { buffer: readback, bytesPerRow, rowsPerImage: atlas.height },
                [atlas.width, atlas.height]
            );
            device.queue.submit([encoder.finish()]);
            await readback.mapAsync(GPUMapMode.READ);
            const bytes = new Uint8Array(readback.getMappedRange());
            const words = new Uint16Array(
                bytes.buffer,
                bytes.byteOffset,
                bytes.byteLength / 2
            );
            const alphaAt = (x, y) => {
                return halfToFloat(words[(y * bytesPerRow) / 2 + x * 4 + 3]);
            };
            const samples = {
                outside: alphaAt(2, 2),
                nearEdge: alphaAt(11, 17),
                inside: alphaAt(17, 17),
            };
            readback.unmap();
            readback.destroy();
            atlas.destroy();
            return samples;
        };

        const samples = await readSamples();
        device.destroy();
        return samples;
    });

    expect(result.outside).toBeLessThan(0);
    expect(Math.abs(result.nearEdge)).toBeLessThan(2);
    expect(result.inside).toBeGreaterThan(0);
});

test("quadratic extrema do not create one-pixel sign streaks", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
        const { createSparseGpuPathAtlas } =
            await import("/tests/oracles/createSparseGpuPathAtlas.js");
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
        const bytesPerRow = Math.ceil((atlas.width * 8) / 256) * 256;
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
        const words = new Uint16Array(
            pixels.buffer,
            pixels.byteOffset,
            pixels.byteLength / 2
        );
        const halfToFloat = (value) => {
            const sign = value & 0x8000 ? -1 : 1;
            const exponent = (value >> 10) & 0x1f;
            const fraction = value & 0x03ff;
            if (exponent === 0) {
                return sign * 2 ** -14 * (fraction / 1024);
            }
            if (exponent === 0x1f) {
                return fraction ? Number.NaN : sign * Number.POSITIVE_INFINITY;
            }
            return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
        };
        const medianAt = (x, y) => {
            const offset = (y * bytesPerRow) / 2 + x * 4;
            const r = halfToFloat(words[offset]);
            const g = halfToFloat(words[offset + 1]);
            const b = halfToFloat(words[offset + 2]);
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

    expect(result.extremumRow.every((value) => value < 0)).toBe(true);
    expect(result.interior).toBeGreaterThan(0);
});

test("MSDF generator reuses bounded scratch and exact immutable atlases", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
        const { MsdfAtlasGenerator } =
            await import("/src/symbols/sparseGpuPathAtlas.js");
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter.requestDevice();
        const generator = new MsdfAtlasGenerator(device, {
            maxScratchBytes: 1024 * 1024,
        });
        const paths = ["M-1-1H1V1H-1Z"];
        const options = {
            tileSize: 32,
            spread: 8,
            shapePadding: 10,
            gutter: 1,
        };
        const first = generator.acquireAtlas(paths, options, "first");
        const scratch = generator._scratchBuffer;
        const second = generator.acquireAtlas(paths, options, "second");
        const third = generator.acquireAtlas(
            ["M0-1L1 1H-1Z"],
            options,
            "third"
        );
        await Promise.all([first.completion, third.completion]);
        const summary = {
            exactAtlasShared: first === second,
            distinctTableSeparated: first !== third,
            scratchReused: scratch === generator._scratchBuffer,
            cacheSize: generator._atlasCache.size,
        };
        generator.destroy();
        await device.queue.onSubmittedWorkDone();
        device.destroy();
        return summary;
    });

    expect(result).toEqual({
        exactAtlasShared: true,
        distinctTableSeparated: true,
        scratchReused: true,
        cacheSize: 2,
    });
});

test("MSDF generator rejects jobs beyond its scratch budget", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const message = await page.evaluate(async () => {
        const { MsdfAtlasGenerator } =
            await import("/src/symbols/sparseGpuPathAtlas.js");
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter.requestDevice();
        const generator = new MsdfAtlasGenerator(device, {
            maxScratchBytes: 1024,
        });
        try {
            generator.createAtlas(["M-1-1H1V1H-1Z"], {
                tileSize: 32,
                spread: 8,
                shapePadding: 10,
                gutter: 1,
            });
            return "no error";
        } catch (error) {
            return String(error);
        } finally {
            generator.destroy();
            device.destroy();
        }
    });

    expect(message).toContain("exceeding its configured or device limit");
});

test("GPU generation supports tightly packed destination rectangles", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
        const { MsdfAtlasGenerator } =
            await import("/src/symbols/sparseGpuPathAtlas.js");
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter.requestDevice();
        const generator = new MsdfAtlasGenerator(device);
        const atlas = generator.createAtlas(
            ["M0 0H100V50H0Z", "M0 0H1000V1000H0Z"],
            {
                tileSize: 64,
                spread: 12,
                shapePadding: 16,
                gutter: 1,
                normalizationSpan: 1000,
                tightPacking: true,
                maxAtlasWidth: 128,
            }
        );
        await atlas.completion;
        const bytesPerRow = Math.ceil((atlas.width * 8) / 256) * 256;
        const readback = device.createBuffer({
            size: bytesPerRow * atlas.height,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        const encoder = device.createCommandEncoder();
        encoder.copyTextureToBuffer(
            { texture: atlas.texture },
            { buffer: readback, bytesPerRow, rowsPerImage: atlas.height },
            [atlas.width, atlas.height]
        );
        device.queue.submit([encoder.finish()]);
        await readback.mapAsync(GPUMapMode.READ);
        const pixels = new Uint8Array(readback.getMappedRange());
        const words = new Uint16Array(
            pixels.buffer,
            pixels.byteOffset,
            pixels.byteLength / 2
        );
        const halfToFloat = (value) => {
            const sign = value & 0x8000 ? -1 : 1;
            const exponent = (value >> 10) & 0x1f;
            const fraction = value & 0x03ff;
            if (exponent === 0) {
                return sign * 2 ** -14 * (fraction / 1024);
            }
            if (exponent === 0x1f) {
                return fraction ? Number.NaN : sign * Number.POSITIVE_INFINITY;
            }
            return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
        };
        const medianAt = (x, y) => {
            const offset = (y * bytesPerRow) / 2 + x * 4;
            const channels = [
                halfToFloat(words[offset]),
                halfToFloat(words[offset + 1]),
                halfToFloat(words[offset + 2]),
            ].sort((a, b) => a - b);
            return channels[1];
        };
        const summary = {
            width: atlas.width,
            height: atlas.height,
            narrowCenter: medianAt(19, 18),
            narrowOutside: medianAt(2, 2),
            squareCenter: medianAt(71, 33),
        };
        readback.unmap();
        readback.destroy();
        atlas.destroy();
        generator.destroy();
        device.destroy();
        return summary;
    });

    expect(result).toMatchObject({ width: 104, height: 66 });
    expect(result.narrowCenter).toBeGreaterThan(0);
    expect(result.narrowOutside).toBeLessThan(0);
    expect(result.squareCenter).toBeGreaterThan(0);
});
