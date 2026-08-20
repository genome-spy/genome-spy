import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    renderCanvas2D: vi.fn(),
}));

vi.mock("./renderCanvas2D.js", () => ({
    default: mocks.renderCanvas2D,
}));

import Canvas2DRenderCoordinator from "./canvas2DRenderCoordinator.js";

describe("Canvas2DRenderCoordinator", () => {
    test("publishes only the settled layout and replays it without arranging", () => {
        let size = { width: 100, height: 50 };
        let invalidations = 0;
        /** @type {{width: number, devicePixelRatio: number}[]} */
        const arrangements = [];
        const viewRoot = {
            /**
             * @param {import("../../view/renderingContext/viewRenderingContext.js").default} context
             * @param {import("../../view/layout/rectangle.js").default} coords
             */
            arrange(context, coords) {
                arrangements.push({
                    width: coords.width,
                    devicePixelRatio: context.getDevicePixelRatio(),
                });
            },
        };
        const surface = {
            invalidateSize() {
                invalidations++;
                if (invalidations == 2) {
                    size = { width: 200, height: 50 };
                    return true;
                }
                return false;
            },
            getLogicalCanvasSize: () => size,
            getDevicePixelRatio: () => 2,
        };
        const onLayoutComputed = vi.fn();
        const coordinator = new Canvas2DRenderCoordinator({
            viewRoot: /** @type {any} */ (viewRoot),
            context: /** @type {any} */ ({}),
            surface: /** @type {any} */ (surface),
            getBackground: () => "white",
            broadcast: vi.fn(),
            onLayoutComputed,
        });

        coordinator.computeLayout();
        coordinator.renderAll();
        coordinator.renderAll();

        expect(arrangements).toEqual([
            { width: 100, devicePixelRatio: 2 },
            { width: 200, devicePixelRatio: 2 },
        ]);
        expect(onLayoutComputed).toHaveBeenCalledOnce();
        expect(mocks.renderCanvas2D).toHaveBeenCalledTimes(2);
        expect(mocks.renderCanvas2D.mock.calls[0][0].layoutResult).toBe(
            mocks.renderCanvas2D.mock.calls[1][0].layoutResult
        );
    });
});
