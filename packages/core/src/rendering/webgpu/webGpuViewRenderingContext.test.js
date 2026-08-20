import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createWebGpuMarkConfig: vi.fn(() => ({
        definition: {},
        config: {},
    })),
}));

vi.mock("./webGpuMarkAdapter.js", () => ({
    createWebGpuMarkConfig: mocks.createWebGpuMarkConfig,
}));

import Rectangle from "../../view/layout/rectangle.js";
import WebGpuViewRenderingContext from "./webGpuViewRenderingContext.js";

describe("WebGpuViewRenderingContext", () => {
    test("translates directional Core clips to a canvas-relative scissor", () => {
        const surface = {
            getDevicePixelRatio: () => 2,
            getLogicalCanvasSize: () => ({ width: 300, height: 200 }),
            useMark: vi.fn(),
        };
        const context = new WebGpuViewRenderingContext(
            { picking: false },
            { surface: /** @type {any} */ (surface) }
        );
        const view = { onBeforeRender: vi.fn() };
        const mark = {
            properties: { clip: "x" },
            unitView: {
                getEffectiveOpacity: () => 1,
            },
        };
        const coords = Rectangle.create(20, 30, 100, 80);

        context.pushView(/** @type {any} */ (view), coords);
        context.renderMark(/** @type {any} */ (mark), {
            clip: {
                rect: Rectangle.create(10, 40, 200, 50),
                clipX: false,
                clipY: true,
            },
        });

        expect(surface.useMark).toHaveBeenCalledWith(
            mark,
            {},
            {},
            {
                scissor: { x: 20, y: 40, width: 100, height: 50 },
            }
        );
    });
});
