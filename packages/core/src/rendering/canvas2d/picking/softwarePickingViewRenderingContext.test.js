// @vitest-environment jsdom

import { describe, expect, test, vi } from "vitest";
import { createHeadlessEngine } from "../../../genomeSpy/headlessBootstrap.js";
import Rectangle from "../../../view/layout/rectangle.js";
import SoftwarePickingBuffer from "./softwarePickingBuffer.js";
import SoftwarePickingRasterizer from "./softwarePickingRasterizer.js";
import SoftwarePickingViewRenderingContext from "./softwarePickingViewRenderingContext.js";

describe("SoftwarePickingViewRenderingContext", () => {
    test("writes topmost rect and point IDs using conservative point bounds", async () => {
        const { view } = await createHeadlessEngine({
            params: [{ name: "pickWidth", value: 20 }],
            layer: [
                {
                    data: { values: [{}] },
                    mark: "rect",
                    encoding: {
                        x: { value: 0.2 },
                        x2: { value: 0.8 },
                        y: { value: 0.2 },
                        y2: { value: 0.8 },
                        fill: { value: "black" },
                    },
                },
                {
                    data: { values: [{}] },
                    mark: {
                        type: "point",
                        shape: "square",
                        angle: 45,
                        minPickingSize: { expr: "pickWidth" },
                    },
                    encoding: {
                        x: { value: 0.5 },
                        y: { value: 0.5 },
                        size: { value: 4 },
                        strokeWidth: { value: 0 },
                    },
                },
            ],
        });
        const buffer = render(view);
        const rectId = buffer.read(25, 25);
        const pointId = buffer.read(50, 50);

        expect(rectId).toBeGreaterThan(0);
        expect(pointId).toBeGreaterThan(0);
        expect(pointId).not.toBe(rectId);
        expect(buffer.read(59, 59)).toBe(pointId);
        expect(buffer.read(61, 61)).toBe(rectId);
    });

    test("follows a cubic link without filling its bounding box", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "link",
                linkShape: "diagonal",
                orient: "vertical",
                minPickingSize: 3,
            },
            encoding: {
                x: { value: 0.1 },
                x2: { value: 0.9 },
                y: { value: 0.2 },
                y2: { value: 0.8 },
                size: { value: 1 },
            },
        });
        const buffer = render(view);

        expect(buffer.read(50, 50)).toBeGreaterThan(0);
        expect(buffer.read(50, 75)).toBe(0);
    });

    test("uses displayed logo-letter bounds, including negative ranges", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { x: 0.2, x2: 0.6 },
                    { x: 0.9, x2: 0.7 },
                ],
            },
            mark: { type: "text", logoLetters: true },
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { domain: [0, 1] },
                },
                x2: { field: "x2" },
                y: { value: 0.2 },
                y2: { value: 0.4 },
                text: { value: "A" },
                size: { value: 12 },
            },
        });
        const buffer = render(view);

        expect(buffer.read(25, 65)).toBeGreaterThan(0);
        expect(buffer.read(75, 65)).toBeGreaterThan(0);
        expect(buffer.read(10, 65)).toBe(0);
    });

    test("picks rotated text and arrow stems without whole-arrow bounds", async () => {
        const { view } = await createHeadlessEngine({
            layer: [
                {
                    data: { values: [{}] },
                    mark: {
                        type: "text",
                        align: "center",
                        baseline: "middle",
                    },
                    encoding: {
                        x: { value: 0.5 },
                        y: { value: 0.25 },
                        text: { value: "TEST" },
                        size: { value: 20 },
                        angle: { value: 45 },
                    },
                },
                {
                    data: { values: [{}] },
                    mark: { type: "arrow", headSpacing: 3 },
                    encoding: {
                        x: { value: 0.1 },
                        x2: { value: 0.9 },
                        y: { value: 0.7 },
                        y2: { value: 0.7 },
                        size: { value: 4 },
                        strokeWidth: { value: 1 },
                    },
                },
            ],
        });
        const buffer = render(view);

        expect(buffer.read(50, 75)).toBeGreaterThan(0);
        expect(buffer.read(50, 30)).toBeGreaterThan(0);
        expect(buffer.read(50, 15)).toBe(0);
    });

    test("skips nonparticipating marks without allocating", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: { type: "rect", tooltip: null },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { value: 0.2 },
                y2: { value: 0.8 },
                fill: { value: "black" },
            },
        });
        const getRasterizer = vi.fn();

        view.arrange(
            new SoftwarePickingViewRenderingContext({
                width: 100,
                height: 100,
                devicePixelRatio: 2,
                getRasterizer,
            }),
            Rectangle.create(0, 0, 100, 100),
            { firstFacet: true }
        );

        expect(getRasterizer).not.toHaveBeenCalled();
    });

    test("calls onBeforeRender once for repeated view scopes", () => {
        const onBeforeRender = vi.fn();
        const view = /** @type {any} */ ({ onBeforeRender });
        const context = new SoftwarePickingViewRenderingContext({
            width: 10,
            height: 10,
            devicePixelRatio: 1,
            getRasterizer: vi.fn(),
        });
        const coords = Rectangle.create(0, 0, 10, 10);

        context.pushView(view, coords);
        context.popView(view);
        context.pushView(view, coords);
        context.popView(view);

        expect(onBeforeRender).toHaveBeenCalledOnce();
    });
});

/**
 * @param {import("../../../view/view.js").default} view
 */
function render(view) {
    const buffer = new SoftwarePickingBuffer(100, 100);
    const rasterizer = new SoftwarePickingRasterizer(buffer);
    view.arrange(
        new SoftwarePickingViewRenderingContext({
            width: 100,
            height: 100,
            devicePixelRatio: 1,
            getRasterizer: () => rasterizer,
        }),
        Rectangle.create(0, 0, 100, 100),
        { firstFacet: true }
    );
    return buffer;
}
