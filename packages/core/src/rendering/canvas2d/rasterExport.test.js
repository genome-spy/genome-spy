// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import { exportCanvas, exportRaster } from "./rasterExport.js";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("Canvas2D raster export", () => {
    test("renders a detached PNG at the requested size and pixel ratio", async () => {
        const { view } = await createRectView();
        const contexts = installCanvasMocks();

        const blob = await exportRaster({
            viewRoot: view,
            liveSize: { width: 100, height: 50 },
            liveDevicePixelRatio: 1,
            logicalWidth: 40,
            logicalHeight: 20,
            pixelRatio: 2,
            clearColor: "#ffffff",
        });

        expect(contexts).toHaveLength(1);
        expect(contexts[0].canvas.width).toBe(80);
        expect(contexts[0].canvas.height).toBe(40);
        expect(contexts[0].setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
        expect(contexts[0].fillRect).toHaveBeenNthCalledWith(1, 0, 0, 40, 20);
        expect(blob.type).toBe("image/png");
        expect(new Uint8Array(await readBlob(blob))).toEqual(PNG_SIGNATURE);
    });

    test("keeps a null export background transparent", async () => {
        const { view } = await createRectView();
        const contexts = installCanvasMocks();

        await exportRaster({
            viewRoot: view,
            liveSize: { width: 40, height: 20 },
            liveDevicePixelRatio: 1,
            clearColor: null,
        });

        expect(contexts[0].fillRect).toHaveBeenCalledTimes(1);
        expect(contexts[0].fillRect).not.toHaveBeenCalledWith(0, 0, 40, 20);
    });

    test("supports the deprecated synchronous data URL on Canvas2D", async () => {
        const { view } = await createRectView();
        const contexts = installCanvasMocks();

        const url = exportCanvas({
            viewRoot: view,
            liveSize: { width: 40, height: 20 },
            liveDevicePixelRatio: 1,
            devicePixelRatio: 1.5,
        });

        expect(url).toBe("data:image/png;base64,canvas2d");
        expect(contexts[0].canvas.width).toBe(60);
        expect(contexts[0].canvas.height).toBe(30);
    });

    test("rejects unsupported MIME types before creating a context", async () => {
        const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");

        await expect(
            exportRaster({
                viewRoot: /** @type {any} */ ({}),
                liveSize: { width: 40, height: 20 },
                liveDevicePixelRatio: 1,
                mimeType: /** @type {any} */ ("image/webp"),
            })
        ).rejects.toThrow("Unsupported raster export MIME type: image/webp");
        expect(getContext).not.toHaveBeenCalled();
    });
});

function installCanvasMocks() {
    /** @type {ReturnType<typeof createContext>[]} */
    const contexts = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
        function (type) {
            if (type != "2d") {
                throw new Error("Unexpected GPU context request: " + type);
            }
            const context = createContext(this);
            contexts.push(context);
            return /** @type {any} */ (context);
        }
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
        function (callback, type) {
            callback(new Blob([PNG_SIGNATURE], { type: type ?? "image/png" }));
        }
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
        "data:image/png;base64,canvas2d"
    );
    return contexts;
}

async function createRectView() {
    return createHeadlessEngine({
        width: 40,
        height: 20,
        padding: 0,
        data: { values: [{}] },
        mark: "rect",
        encoding: {
            x: { value: 0.1 },
            x2: { value: 0.9 },
            y: { value: 0.1 },
            y2: { value: 0.9 },
            fill: { value: "#123456" },
        },
    });
}

/** @param {HTMLCanvasElement} canvas */
function createContext(canvas) {
    return {
        canvas,
        fillStyle: "#000000",
        strokeStyle: "#000000",
        globalAlpha: 1,
        globalCompositeOperation: "source-over",
        lineWidth: 1,
        resetTransform: vi.fn(),
        clearRect: vi.fn(),
        setTransform: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
    };
}

const PNG_SIGNATURE = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** @param {Blob} blob @returns {Promise<ArrayBuffer>} */
function readBlob(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () =>
            resolve(/** @type {ArrayBuffer} */ (reader.result))
        );
        reader.addEventListener("error", () => reject(reader.error));
        reader.readAsArrayBuffer(blob);
    });
}
