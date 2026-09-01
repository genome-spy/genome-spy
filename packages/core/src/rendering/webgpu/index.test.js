import { expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    initialize: vi.fn(),
    exportRaster: vi.fn(),
    rasterizeSvgRuns: vi.fn(),
}));

vi.mock("./webGpuSurface.js", () => ({
    default: class WebGpuSurface {
        initialize = mocks.initialize;
    },
}));

vi.mock("./webGpuRasterExport.js", () => ({
    exportRaster: mocks.exportRaster,
    rasterizeSvgRuns: mocks.rasterizeSvgRuns,
}));

import { createWebGpuRenderingBackend } from "./index.js";

test("supplies Core's bundled default font bitmap", async () => {
    const backend = await createWebGpuRenderingBackend(/** @type {any} */ ({}));

    expect(backend.defaultFontBitmapUrl).toContain("Lato-Regular.png");
});

test("serializes asynchronous raster and hybrid SVG exports", async () => {
    /** @type {((value: Blob) => void) | undefined} */
    let releaseRaster;
    mocks.exportRaster.mockImplementation(
        () =>
            new Promise((resolve) => {
                releaseRaster = resolve;
            })
    );
    mocks.rasterizeSvgRuns.mockResolvedValue(undefined);
    const backend = await createWebGpuRenderingBackend(/** @type {any} */ ({}));

    const rasterPromise = backend.exportRaster?.(/** @type {any} */ ({}));
    const svgPromise = backend.rasterizeSvgRuns?.(/** @type {any} */ ({}));
    expect(() => backend.exportCanvas(/** @type {any} */ ({}))).toThrow(
        "Synchronous canvas export is unavailable"
    );
    await Promise.resolve();
    expect(mocks.exportRaster).toHaveBeenCalledOnce();
    expect(mocks.rasterizeSvgRuns).not.toHaveBeenCalled();

    releaseRaster?.(new Blob());
    await rasterPromise;
    await svgPromise;
    expect(mocks.rasterizeSvgRuns).toHaveBeenCalledOnce();
});
