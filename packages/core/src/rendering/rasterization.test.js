// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    canvasExportRaster: vi.fn(),
    canvasRasterizeSvgRuns: vi.fn(),
    createCanvas2DSvgRasterizer: vi.fn(),
}));

vi.mock("./canvas2d/rasterExport.js", () => ({
    exportRaster: mocks.canvasExportRaster,
}));

vi.mock("./canvas2d/svgRasterizer.js", () => ({
    createCanvas2DSvgRasterizer: mocks.createCanvas2DSvgRasterizer,
}));

import {
    exportRasterUsingBackend,
    RasterizationUnavailableError,
    rasterizeSvgRunsUsingBackend,
} from "./rasterization.js";

beforeEach(() => {
    vi.resetAllMocks();
    mocks.createCanvas2DSvgRasterizer.mockReturnValue(
        mocks.canvasRasterizeSvgRuns
    );
});

describe("raster capability routing", () => {
    test("prefers the selected backend for full raster export", async () => {
        const blob = new Blob(["selected"]);
        const exportRaster = vi.fn().mockResolvedValue(blob);
        const backend = createBackend({ exportRaster });

        await expect(
            exportRasterUsingBackend(backend, createExportOptions())
        ).resolves.toBe(blob);
        expect(exportRaster).toHaveBeenCalledOnce();
        expect(mocks.canvasExportRaster).not.toHaveBeenCalled();
    });

    test("uses Canvas2D when the selected backend cannot export raster", async () => {
        const blob = new Blob(["canvas"]);
        mocks.canvasExportRaster.mockResolvedValue(blob);
        const backend = createBackend();

        await expect(
            exportRasterUsingBackend(backend, createExportOptions())
        ).resolves.toBe(blob);
        expect(mocks.canvasExportRaster).toHaveBeenCalledWith(
            expect.objectContaining({
                liveSize: { width: 100, height: 50 },
                liveDevicePixelRatio: 2,
            })
        );
    });

    test("falls through only on unavailable full-raster capability", async () => {
        const unavailable = new RasterizationUnavailableError("unsupported");
        const exportRaster = vi.fn().mockRejectedValue(unavailable);
        const blob = new Blob(["canvas"]);
        mocks.canvasExportRaster.mockResolvedValue(blob);

        await expect(
            exportRasterUsingBackend(
                createBackend({ exportRaster }),
                createExportOptions()
            )
        ).resolves.toBe(blob);

        const paintFailure = new Error("paint failed");
        exportRaster.mockRejectedValue(paintFailure);
        await expect(
            exportRasterUsingBackend(
                createBackend({ exportRaster }),
                createExportOptions()
            )
        ).rejects.toBe(paintFailure);
    });

    test("rejects explicitly when no full-raster backend is available", async () => {
        mocks.canvasExportRaster.mockRejectedValue(
            new RasterizationUnavailableError("No Canvas2D")
        );

        await expect(
            exportRasterUsingBackend(createBackend(), createExportOptions())
        ).rejects.toThrow(
            "Raster export is unsupported because no raster rendering backend is available."
        );
    });

    test("prefers the selected backend for selective SVG rasterization", async () => {
        const rasterizeSvgRuns = vi.fn();
        const options = createSvgOptions();

        await rasterizeSvgRunsUsingBackend(
            createBackend({ rasterizeSvgRuns }),
            options
        );

        expect(rasterizeSvgRuns).toHaveBeenCalledWith(options);
        expect(mocks.createCanvas2DSvgRasterizer).not.toHaveBeenCalled();
    });

    test("uses Canvas2D for unsupported selective SVG rasterization", async () => {
        const options = createSvgOptions();
        await rasterizeSvgRunsUsingBackend(createBackend(), options);

        expect(mocks.createCanvas2DSvgRasterizer).toHaveBeenCalledOnce();
        expect(mocks.canvasRasterizeSvgRuns).toHaveBeenCalledWith(options);
    });

    test("keeps WebGPU full export selected while Canvas2D handles hybrid SVG", async () => {
        const webGpuBlob = new Blob(["webgpu"]);
        const exportRaster = vi.fn().mockResolvedValue(webGpuBlob);
        const backend = createBackend({ exportRaster });

        await expect(
            exportRasterUsingBackend(backend, createExportOptions())
        ).resolves.toBe(webGpuBlob);
        await rasterizeSvgRunsUsingBackend(backend, createSvgOptions());

        expect(exportRaster).toHaveBeenCalledOnce();
        expect(mocks.canvasExportRaster).not.toHaveBeenCalled();
        expect(mocks.canvasRasterizeSvgRuns).toHaveBeenCalledOnce();
    });

    test("propagates selective rendering errors without trying Canvas2D", async () => {
        const failure = new Error("paint failed");
        const rasterizeSvgRuns = vi.fn(() => {
            throw failure;
        });

        await expect(
            rasterizeSvgRunsUsingBackend(
                createBackend({ rasterizeSvgRuns }),
                createSvgOptions()
            )
        ).rejects.toBe(failure);
        expect(mocks.createCanvas2DSvgRasterizer).not.toHaveBeenCalled();
    });

    test("reports Canvas2D initialization failure as unavailable", async () => {
        const failure = new RasterizationUnavailableError("No Canvas2D");
        mocks.createCanvas2DSvgRasterizer.mockImplementation(() => {
            throw failure;
        });

        await expect(
            rasterizeSvgRunsUsingBackend(createBackend(), createSvgOptions())
        ).rejects.toBe(failure);
    });
});

/**
 * @param {Partial<import("./renderingBackend.js").RenderingBackend>} [capabilities]
 * @returns {import("./renderingBackend.js").RenderingBackend}
 */
function createBackend(capabilities = {}) {
    return /** @type {import("./renderingBackend.js").RenderingBackend} */ ({
        surface: {
            getLogicalCanvasSize: () => ({ width: 100, height: 50 }),
            getDevicePixelRatio: () => 2,
        },
        exportCanvas: vi.fn(),
        createRenderCoordinator: vi.fn(),
        ...capabilities,
    });
}

/** @returns {import("./renderingBackend.js").RasterExportOptions} */
function createExportOptions() {
    return { viewRoot: /** @type {any} */ ({}) };
}

/** @returns {import("./renderingBackend.js").SvgRunRasterizationOptions} */
function createSvgOptions() {
    return {
        runs: [],
        viewRoot: /** @type {any} */ ({}),
        logicalWidth: 100,
        logicalHeight: 50,
        pixelRatio: 2,
    };
}
