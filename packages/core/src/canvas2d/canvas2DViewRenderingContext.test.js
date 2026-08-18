// @vitest-environment jsdom

import { describe, expect, test, vi } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import Rectangle from "../view/layout/rectangle.js";
import Canvas2DViewRenderingContext from "./canvas2DViewRenderingContext.js";

function createRecordingContext() {
    /**
     * @type {{
     *     arcs: [number, number, number][],
     *     fillRects: [number, number, number, number][],
     *     saves: number
     * }}
     */
    const calls = {
        arcs: [],
        fillRects: [],
        saves: 0,
    };
    const context = /** @type {any} */ ({
        canvas: { width: 200, height: 100 },
        fillStyle: "#000000",
        strokeStyle: "#000000",
        globalAlpha: 1,
        lineWidth: 1,
        resetTransform: vi.fn(),
        clearRect: vi.fn(),
        setTransform: vi.fn(),
        save: () => calls.saves++,
        restore: vi.fn(),
        beginPath: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
        fillRect: (
            /** @type {number} */ x,
            /** @type {number} */ y,
            /** @type {number} */ width,
            /** @type {number} */ height
        ) => calls.fillRects.push([x, y, width, height]),
        strokeRect: vi.fn(),
        arc: (
            /** @type {number} */ x,
            /** @type {number} */ y,
            /** @type {number} */ radius
        ) => calls.arcs.push([x, y, radius]),
        fill: vi.fn(),
        stroke: vi.fn(),
    });
    return { calls, context };
}

function render(
    /** @type {import("../view/view.js").default} */ view,
    /** @type {CanvasRenderingContext2D} */ context
) {
    view.render(
        new Canvas2DViewRenderingContext(
            { picking: false },
            {
                context,
                width: 100,
                height: 100,
                devicePixelRatio: 2,
                background: null,
                paint: true,
            }
        ),
        Rectangle.create(0, 0, 100, 100),
        { firstFacet: true }
    );
}

describe("Canvas2DViewRenderingContext", () => {
    test("reprojects rectangles from the current scale domain", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { x: 0, x2: 1 },
                    { x: 1, x2: 2 },
                ],
            },
            mark: "rect",
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { domain: [0, 2] },
                },
                x2: { field: "x2" },
                y: { value: 0 },
                y2: { value: 1 },
                fill: { value: "black" },
            },
        });
        const first = createRecordingContext();
        render(view, first.context);

        expect(first.context.setTransform).toHaveBeenCalledWith(
            2,
            0,
            0,
            2,
            0,
            0
        );
        expect(first.calls.fillRects).toHaveLength(2);
        expect(first.calls.fillRects[0][2]).toBeCloseTo(50.2);

        view.getScaleResolution("x").getScale().domain([0, 1]);
        const zoomed = createRecordingContext();
        render(view, zoomed.context);

        expect(zoomed.calls.fillRects[0][2]).toBeCloseTo(100.2);
        expect(zoomed.calls.fillRects[1][0]).toBeCloseTo(99.9);
    });

    test("draws points without per-datum save scopes", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ x: 0.25 }, { x: 0.75 }] },
            mark: "point",
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { domain: [0, 1] },
                },
                y: { value: 0.5 },
                size: { value: 400 },
                fill: { value: "black" },
            },
        });
        const recording = createRecordingContext();

        render(view, recording.context);

        expect(recording.calls.arcs).toEqual([
            [25, 50, 10],
            [75, 50, 10],
        ]);
        expect(recording.calls.saves).toBe(1);
        expect(recording.context.fill).toHaveBeenCalledTimes(2);
    });
});
