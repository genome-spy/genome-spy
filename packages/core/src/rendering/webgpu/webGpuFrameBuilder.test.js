import { describe, expect, test } from "vitest";

import Rectangle from "../../view/layout/rectangle.js";
import WebGpuFrameBuilder from "./webGpuFrameBuilder.js";

describe("WebGpuFrameBuilder", () => {
    test("groups only consecutive MSAA draws of the same mark", () => {
        const frame = new WebGpuFrameBuilder({
            width: 100,
            height: 50,
            dpr: 2,
        });
        const firstMark = /** @type {any} */ ({});
        const otherMark = /** @type {any} */ ({});
        const first = createDraw({ x: 5, y: 6, width: 40, height: 20 });
        const second = createDraw({ x: 30, y: 4, width: 50, height: 10 });
        const direct = createDraw();
        const last = createDraw({ x: 0, y: 0, width: 10, height: 10 });

        frame.addDraw(firstMark, first, false, { sampleCount: 4 });
        frame.addDraw(firstMark, second, false, { sampleCount: 4 });
        frame.addDraw(otherMark, direct, false, { sampleCount: 1 });
        frame.addDraw(firstMark, last, false, { sampleCount: 4 });

        expect(frame.finish().items).toEqual([
            {
                bounds: { x: 5, y: 4, width: 75, height: 22 },
                sampleCount: 4,
                items: [first, second],
            },
            direct,
            {
                bounds: { x: 0, y: 0, width: 10, height: 10 },
                sampleCount: 4,
                items: [last],
            },
        ]);
    });

    test("keeps opacity nesting and picking frames independent", () => {
        const frame = new WebGpuFrameBuilder({
            width: 100,
            height: 50,
            dpr: 1,
        });
        const view = /** @type {any} */ ({
            mark: { properties: { clip: "x" } },
        });
        const mark = /** @type {any} */ ({});
        const visible = createDraw();
        const picking = createDraw();

        frame.pushViewGroup(view, Rectangle.create(5, 6, 40, 20), 0.5);
        frame.addDraw(mark, visible, false, { sampleCount: 1 });
        frame.popViewGroup();
        frame.addDraw(mark, picking, true, { sampleCount: 1 });

        expect(frame.finish()).toEqual({
            items: [
                {
                    bounds: { x: 5, y: 0, width: 40, height: 50 },
                    opacity: 0.5,
                    items: [visible],
                },
            ],
            pickingDraws: [picking],
        });
    });

    test("rejects an unfinished opacity scope", () => {
        const frame = new WebGpuFrameBuilder({
            width: 100,
            height: 50,
            dpr: 1,
        });
        const view = /** @type {any} */ ({
            mark: { properties: { clip: true } },
        });

        frame.pushViewGroup(view, Rectangle.ZERO, 0.5);

        expect(() => frame.finish()).toThrow("open WebGPU render group");
    });
});

/** @param {import("@genome-spy/webgpu-renderer").DrawRect} [viewport] */
function createDraw(viewport) {
    return /** @type {import("@genome-spy/webgpu-renderer").DrawCommand} */ ({
        mark: { markId: -1 },
        ...(viewport ? { viewport } : {}),
    });
}
