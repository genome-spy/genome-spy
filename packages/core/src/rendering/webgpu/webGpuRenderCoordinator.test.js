import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    contexts: /** @type {any[]} */ ([]),
}));

vi.mock("./webGpuViewRenderingContext.js", () => ({
    default: class {
        constructor() {
            this.pushView = vi.fn();
            this.popView = vi.fn();
            this.finish = vi.fn();
            mocks.contexts.push(this);
        }
    },
}));

import WebGpuRenderCoordinator from "./webGpuRenderCoordinator.js";

describe("WebGpuRenderCoordinator", () => {
    test("replays the settled layout without arranging or destroying marks", () => {
        const arrange = vi.fn((context, coords) => {
            context.pushView(viewRoot, coords);
            context.popView(viewRoot);
        });
        const viewRoot = { arrange };
        let background = /** @type {string | undefined} */ ("#336699");
        const surface = {
            invalidateSize: vi.fn(() => false),
            getLogicalCanvasSize: () => ({ width: 100, height: 50 }),
            getDevicePixelRatio: () => 2,
            beginFrame: vi.fn(),
            render: vi.fn(),
        };
        const coordinator = new WebGpuRenderCoordinator({
            viewRoot: /** @type {any} */ (viewRoot),
            surface: /** @type {any} */ (surface),
            getBackground: () => background,
            broadcast: vi.fn(),
            onLayoutComputed: vi.fn(),
        });

        coordinator.computeLayout();
        coordinator.renderAll();
        coordinator.renderAll();

        expect(arrange).toHaveBeenCalledOnce();
        expect(arrange.mock.calls[0][0].getDevicePixelRatio()).toBe(2);
        expect(surface.beginFrame).toHaveBeenCalledTimes(2);
        expect(surface.render).toHaveBeenCalledTimes(2);
        expect(surface.render).toHaveBeenNthCalledWith(1, {
            r: 0x33 / 255,
            g: 0x66 / 255,
            b: 0x99 / 255,
            a: 1,
        });
        background = undefined;
        coordinator.renderAll();

        expect(surface.render).toHaveBeenNthCalledWith(3, {
            r: 0,
            g: 0,
            b: 0,
            a: 0,
        });
        expect(mocks.contexts).toHaveLength(3);
        expect(mocks.contexts[0].finish).toHaveBeenCalledOnce();
        expect(mocks.contexts[0].pushView).toHaveBeenCalledWith(
            viewRoot,
            expect.objectContaining({ width: 100, height: 50 })
        );
    });
});
