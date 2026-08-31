// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createLayoutResult: vi.fn(() => ({ layout: true })),
}));

vi.mock("../../view/layout/layoutResult.js", () => ({
    createLayoutResult: mocks.createLayoutResult,
}));

import { RasterizationUnavailableError } from "../rasterization.js";
import { exportRaster, rasterizeSvgRuns } from "./webGpuRasterExport.js";

beforeEach(() => {
    vi.clearAllMocks();
});

describe("WebGPU raster export", () => {
    test("uses an export-sized layout and waits before encoding", async () => {
        /** @type {string[]} */
        const events = [];
        const blob = new Blob(["png"], { type: "image/png" });
        const { surface, target } = createSurface({
            onSubmittedWorkDone: vi.fn(async () => events.push("ready")),
            toBlob: vi.fn((callback) => {
                events.push("blob");
                callback(blob);
            }),
        });
        const viewRoot = /** @type {any} */ ({ arrange: vi.fn() });

        const result = await exportRaster(surface, {
            viewRoot,
            logicalWidth: 320,
            logicalHeight: 180,
            pixelRatio: 1.5,
            clearColor: "rgba(10, 20, 30, 0.5)",
        });

        expect(result).toBe(blob);
        expect(surface.createExportTarget).toHaveBeenCalledWith(320, 180, 1.5);
        expect(mocks.createLayoutResult).toHaveBeenCalledWith(
            viewRoot,
            expect.objectContaining({ width: 320, height: 180 }),
            {
                devicePixelRatio: 1.5,
                renderingOptions: { firstFacet: true },
            }
        );
        expect(surface.renderLayoutToTarget).toHaveBeenCalledWith(
            { layout: true },
            target,
            { r: 10 / 255, g: 20 / 255, b: 30 / 255, a: 0.5 }
        );
        expect(events).toEqual(["ready", "blob"]);
        expect(target.handle.destroy).toHaveBeenCalledOnce();
    });

    test("validates the raster MIME type", async () => {
        const { surface } = createSurface();
        const viewRoot = /** @type {any} */ ({});

        await expect(
            exportRaster(surface, {
                viewRoot,
                mimeType: /** @type {any} */ ("image/jpeg"),
            })
        ).rejects.toThrow("Unsupported raster export MIME type");
    });

    test("destroys the target when raster encoding fails", async () => {
        const { surface, target } = createSurface({
            toBlob: vi.fn((callback) => callback(null)),
        });

        await expect(
            exportRaster(surface, { viewRoot: /** @type {any} */ ({}) })
        ).rejects.toThrow("could not encode");

        expect(target.handle.destroy).toHaveBeenCalledOnce();
    });

    test("destroys the target when background parsing fails", async () => {
        const { surface, target } = createSurface();

        await expect(
            exportRaster(surface, {
                viewRoot: /** @type {any} */ ({}),
                clearColor: "not-a-color",
            })
        ).rejects.toThrow("Invalid WebGPU canvas background color");

        expect(target.handle.destroy).toHaveBeenCalledOnce();
    });

    test("renders selected SVG runs transparently and preserves placeholders", async () => {
        const cropContext = {
            resetTransform: vi.fn(),
            clearRect: vi.fn(),
            drawImage: vi.fn(),
        };
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            /** @type {any} */ (cropContext)
        );
        vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
            "data:image/png;base64,webgpu-run"
        );
        const { surface, target } = createSurface({ width: 200, height: 160 });
        const selected = /** @type {any} */ ({});
        const other = /** @type {any} */ ({});
        const svg = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg"
        );
        const firstVector = document.createElementNS(svg.namespaceURI, "path");
        const image = document.createElementNS(svg.namespaceURI, "image");
        const lastVector = document.createElementNS(svg.namespaceURI, "text");
        svg.append(firstVector, image, lastVector);
        const run =
            /** @type {import("../svg/svgViewRenderingContext.js").SvgRasterRun} */ ({
                marks: new Set([selected]),
                targets: [],
                viewNodes: new Set(),
                bounds: { x1: 1.25, y1: 2.25, x2: 10.1, y2: 12.6 },
                image,
            });

        await rasterizeSvgRuns(surface, {
            runs: [run, run],
            viewRoot: /** @type {any} */ ({}),
            layoutResult: /** @type {any} */ ({ layout: true }),
            logicalWidth: 100,
            logicalHeight: 80,
            pixelRatio: 2,
        });

        const renderCall = surface.renderLayoutToTarget.mock.calls[0];
        expect(renderCall.slice(0, 3)).toEqual([
            { layout: true },
            target,
            { r: 0, g: 0, b: 0, a: 0 },
        ]);
        expect(renderCall[3](selected)).toBe(true);
        expect(renderCall[3](other)).toBe(false);
        expect(cropContext.drawImage).toHaveBeenCalledWith(
            target.canvas,
            2,
            4,
            19,
            22,
            0,
            0,
            19,
            22
        );
        expect(image.getAttribute("x")).toBe("1");
        expect(image.getAttribute("y")).toBe("2");
        expect(image.getAttribute("width")).toBe("9.5");
        expect(image.getAttribute("height")).toBe("11");
        expect(image.getAttribute("href")).toBe(
            "data:image/png;base64,webgpu-run"
        );
        expect(Array.from(svg.children)).toEqual([
            firstVector,
            image,
            lastVector,
        ]);
        expect(surface.createExportTarget).toHaveBeenCalledOnce();
        expect(target.handle.onSubmittedWorkDone).toHaveBeenCalledTimes(2);
        expect(target.handle.destroy).toHaveBeenCalledOnce();
    });

    test("reports detached target initialization as unavailable", async () => {
        const surface = /** @type {any} */ ({
            getLogicalCanvasSize: () => ({ width: 100, height: 50 }),
            getDevicePixelRatio: () => 2,
            createExportTarget: vi.fn(() => {
                throw new Error("no context");
            }),
        });

        await expect(
            exportRaster(surface, { viewRoot: /** @type {any} */ ({}) })
        ).rejects.toThrow(RasterizationUnavailableError);
    });
});

/**
 * @param {{width?: number, height?: number, onSubmittedWorkDone?: ReturnType<typeof vi.fn>, toBlob?: ReturnType<typeof vi.fn>, toDataURL?: ReturnType<typeof vi.fn>}} [options]
 */
function createSurface(options = {}) {
    const canvas = /** @type {HTMLCanvasElement} */ (
        /** @type {unknown} */ ({
            width: options.width ?? 480,
            height: options.height ?? 270,
            toBlob: options.toBlob ?? vi.fn(),
            toDataURL: options.toDataURL ?? vi.fn(),
        })
    );
    const handle = {
        onSubmittedWorkDone:
            options.onSubmittedWorkDone ?? vi.fn(async () => undefined),
        destroy: vi.fn(),
    };
    const target = {
        handle,
        canvas,
        logicalWidth: 320,
        logicalHeight: 180,
        pixelRatio: 1.5,
    };
    const surface = {
        getLogicalCanvasSize: () => ({ width: 160, height: 90 }),
        getDevicePixelRatio: () => 2,
        createExportTarget: vi.fn((logicalWidth, logicalHeight, pixelRatio) => {
            target.logicalWidth = logicalWidth;
            target.logicalHeight = logicalHeight;
            target.pixelRatio = pixelRatio;
            return target;
        }),
        renderLayoutToTarget: vi.fn(),
    };
    return {
        surface: /** @type {any} */ (surface),
        target: /** @type {any} */ (target),
    };
}
