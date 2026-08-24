import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    contexts: /** @type {any[]} */ ([]),
}));

vi.mock("./webGpuViewRenderingContext.js", () => ({
    default: class {
        constructor() {
            this.pushView = vi.fn();
            this.popView = vi.fn();
            this.finish = vi.fn();
            this.render = vi.fn();
            mocks.contexts.push(this);
        }
    },
}));

import WebGpuRenderCoordinator from "./webGpuRenderCoordinator.js";

beforeEach(() => {
    mocks.contexts.length = 0;
});

describe("WebGpuRenderCoordinator", () => {
    test("compiles the settled layout once and reuses its frame plan", () => {
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
        expect(mocks.contexts).toHaveLength(1);
        expect(mocks.contexts[0].finish).toHaveBeenCalledOnce();
        expect(mocks.contexts[0].render).toHaveBeenCalledTimes(3);
        expect(mocks.contexts[0].render).toHaveBeenNthCalledWith(1, {
            picking: false,
        });
        expect(mocks.contexts[0].pushView).toHaveBeenCalledWith(
            viewRoot,
            expect.objectContaining({ width: 100, height: 50 })
        );
    });

    test("reuses the picking frame until visible output changes", () => {
        const viewRoot = { arrange: vi.fn() };
        const surface = {
            invalidateSize: vi.fn(() => false),
            getLogicalCanvasSize: () => ({ width: 100, height: 50 }),
            getDevicePixelRatio: () => 1,
            beginFrame: vi.fn(),
            beginPickingFrame: vi.fn(),
            render: vi.fn(),
            renderPicking: vi.fn(),
        };
        const coordinator = new WebGpuRenderCoordinator({
            viewRoot: /** @type {any} */ (viewRoot),
            surface: /** @type {any} */ (surface),
            getBackground: () => undefined,
            broadcast: vi.fn(),
            onLayoutComputed: vi.fn(),
        });

        coordinator.computeLayout();
        expect(mocks.contexts).toHaveLength(1);
        coordinator.renderPickingFramebuffer();
        coordinator.renderPickingFramebuffer();
        expect(surface.beginPickingFrame).toHaveBeenCalledOnce();
        expect(surface.renderPicking).toHaveBeenCalledOnce();

        coordinator.renderAll();
        coordinator.renderPickingFramebuffer();
        expect(surface.renderPicking).toHaveBeenCalledTimes(2);
        expect(mocks.contexts[0].render).toHaveBeenNthCalledWith(1, {
            picking: true,
        });
        expect(mocks.contexts[0].render).toHaveBeenNthCalledWith(2, {
            picking: false,
        });
        expect(mocks.contexts[0].render).toHaveBeenNthCalledWith(3, {
            picking: true,
        });

        coordinator.computeLayout();
        expect(mocks.contexts).toHaveLength(2);
        coordinator.renderPickingFramebuffer();
        expect(surface.renderPicking).toHaveBeenCalledTimes(3);
    });
});
