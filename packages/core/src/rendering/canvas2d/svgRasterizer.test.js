// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    renderCanvas2D: vi.fn(),
}));

vi.mock("./renderCanvas2D.js", () => ({ default: mocks.renderCanvas2D }));

import { RasterizationUnavailableError } from "../rasterization.js";
import { createCanvas2DSvgRasterizer } from "./svgRasterizer.js";

beforeEach(() => {
    vi.resetAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("Canvas2D SVG rasterizer", () => {
    test("renders selected marks transparently and embeds a cropped PNG", () => {
        const contexts = installCanvasMocks();
        const selectedMark = /** @type {any} */ ({});
        const otherMark = /** @type {any} */ ({});
        const run = createRun(new Set([selectedMark]), {
            x1: 1.25,
            y1: 2.25,
            x2: 10.1,
            y2: 12.6,
        });
        const rasterizeSvgRuns = createCanvas2DSvgRasterizer();

        rasterizeSvgRuns({
            runs: [run],
            viewRoot: /** @type {any} */ ({}),
            layoutResult: /** @type {any} */ ({}),
            logicalWidth: 100,
            logicalHeight: 80,
            pixelRatio: 1,
        });

        expect(mocks.renderCanvas2D).toHaveBeenCalledOnce();
        const renderOptions = mocks.renderCanvas2D.mock.calls[0][0];
        expect(renderOptions).toMatchObject({
            width: 100,
            height: 80,
            devicePixelRatio: 1,
            background: null,
            paint: true,
        });
        expect(renderOptions.markPredicate(selectedMark)).toBe(true);
        expect(renderOptions.markPredicate(otherMark)).toBe(false);
        expect(contexts[0].canvas.width).toBe(100);
        expect(contexts[0].canvas.height).toBe(80);
        expect(contexts[1].drawImage).toHaveBeenCalledWith(
            contexts[0].canvas,
            1,
            2,
            10,
            11,
            0,
            0,
            10,
            11
        );
        expect(run.image?.getAttribute("x")).toBe("1");
        expect(run.image?.getAttribute("y")).toBe("2");
        expect(run.image?.getAttribute("width")).toBe("10");
        expect(run.image?.getAttribute("height")).toBe("11");
        expect(run.image?.getAttribute("href")).toBe(
            "data:image/png;base64,canvas2d-run"
        );
    });

    test("uses physical crop coordinates at the requested pixel ratio", () => {
        const contexts = installCanvasMocks();
        const run = createRun(new Set(), {
            x1: 1.25,
            y1: 2.25,
            x2: 10.1,
            y2: 12.6,
        });

        createCanvas2DSvgRasterizer()({
            runs: [run],
            viewRoot: /** @type {any} */ ({ arrange: vi.fn() }),
            logicalWidth: 100,
            logicalHeight: 80,
            pixelRatio: 2,
        });

        expect(contexts[0].canvas.width).toBe(200);
        expect(contexts[0].canvas.height).toBe(160);
        expect(contexts[1].drawImage).toHaveBeenCalledWith(
            contexts[0].canvas,
            2,
            4,
            19,
            22,
            0,
            0,
            19,
            22
        );
        expect(run.image?.getAttribute("x")).toBe("1");
        expect(run.image?.getAttribute("y")).toBe("2");
        expect(run.image?.getAttribute("width")).toBe("9.5");
        expect(run.image?.getAttribute("height")).toBe("11");
    });

    test("reports context initialization as unavailable", () => {
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            null
        );

        expect(() => createCanvas2DSvgRasterizer()).toThrow(
            RasterizationUnavailableError
        );
        expect(mocks.renderCanvas2D).not.toHaveBeenCalled();
    });

    test("propagates rendering failures", () => {
        installCanvasMocks();
        const failure = new Error("paint failed");
        mocks.renderCanvas2D.mockImplementation(() => {
            throw failure;
        });
        const rasterizeSvgRuns = createCanvas2DSvgRasterizer();

        expect(() =>
            rasterizeSvgRuns({
                runs: [
                    createRun(new Set(), {
                        x1: 0,
                        y1: 0,
                        x2: 10,
                        y2: 10,
                    }),
                ],
                viewRoot: /** @type {any} */ ({}),
                layoutResult: /** @type {any} */ ({}),
                logicalWidth: 100,
                logicalHeight: 80,
                pixelRatio: 1,
            })
        ).toThrow(failure);
    });
});

function installCanvasMocks() {
    /** @type {ReturnType<typeof createContext>[]} */
    const contexts = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
        function (type) {
            if (String(type) != "2d") {
                throw new Error("Unexpected context request: " + type);
            }
            const context = createContext(this);
            contexts.push(context);
            return /** @type {any} */ (context);
        }
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
        "data:image/png;base64,canvas2d-run"
    );
    return contexts;
}

/** @param {HTMLCanvasElement} canvas */
function createContext(canvas) {
    return {
        canvas,
        resetTransform: vi.fn(),
        clearRect: vi.fn(),
        drawImage: vi.fn(),
    };
}

/**
 * @param {Set<import("../../marks/mark.js").default>} marks
 * @param {import("../immediate/bounds.js").RenderBounds} bounds
 * @returns {import("../svg/svgViewRenderingContext.js").SvgRasterRun}
 */
function createRun(marks, bounds) {
    return {
        marks,
        targets: [],
        viewNodes: new Set(),
        anchor: document.createComment("raster-run"),
        bounds,
        image: document.createElementNS("http://www.w3.org/2000/svg", "image"),
    };
}
