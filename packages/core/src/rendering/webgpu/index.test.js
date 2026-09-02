import { expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const prepareOutlineFont = vi.fn();
    return {
        initialize: vi.fn(),
        exportRaster: vi.fn(),
        rasterizeSvgRuns: vi.fn(),
        prepareOutlineFont,
        createOutlineFontPreparer: vi.fn(() => prepareOutlineFont),
    };
});

vi.mock("./webGpuSurface.js", () => ({
    default: class WebGpuSurface {
        initialize = mocks.initialize;
    },
}));

vi.mock("./webGpuRasterExport.js", () => ({
    exportRaster: mocks.exportRaster,
    rasterizeSvgRuns: mocks.rasterizeSvgRuns,
}));

vi.mock("./webGpuFontCatalog.js", () => ({
    createOutlineFontPreparer: mocks.createOutlineFontPreparer,
}));

import { createWebGpuRenderingBackend } from "./index.js";

test("supplies Core's bundled default font bitmap", async () => {
    const backend = await createWebGpuRenderingBackend(/** @type {any} */ ({}));

    expect(backend.defaultFontBitmapUrl).toContain("Lato-Regular.png");
    expect(backend.prepareOutlineFont).toBeTypeOf("function");
});

test("constructs a lazy preparer from the application font catalog", async () => {
    const fontCatalog = [
        { family: "Study Sans", source: "https://example.test/study.ttf" },
    ];
    const backend = await createWebGpuRenderingBackend(
        /** @type {any} */ ({ fontCatalog })
    );

    expect(mocks.createOutlineFontPreparer).toHaveBeenCalledWith(fontCatalog);
    expect(backend.prepareOutlineFont).toBe(mocks.prepareOutlineFont);
    expect(mocks.prepareOutlineFont).not.toHaveBeenCalled();
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
