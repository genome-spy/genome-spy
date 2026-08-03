import { describe, expect, test } from "vitest";

import Rectangle from "../view/layout/rectangle.js";
import LayerView from "../view/layerView.js";
import UnitView from "../view/unitView.js";
import { createAndInitialize, renderToLayout } from "../view/testUtils.js";

describe("nested offset scales", () => {
    test("derives a pixel range from the parent band and updates on resize", async () => {
        const view = await createAndInitialize(
            {
                data: {
                    values: [
                        { category: "A", group: "first", value: 2 },
                        { category: "A", group: "second", value: 3 },
                        { category: "B", group: "first", value: 4 },
                        { category: "B", group: "second", value: 5 },
                    ],
                },
                mark: "rect",
                encoding: {
                    x: { field: "category", type: "nominal" },
                    y: { field: "value", type: "quantitative" },
                    xOffset: { field: "group", type: "nominal" },
                },
            },
            UnitView
        );

        renderToLayout(view, Rectangle.create(0, 0, 300, 200));

        const xScale = /** @type {any} */ (
            view.getScaleResolution("x").getScale()
        );
        const offsetScale = /** @type {any} */ (
            view.getScaleResolution("xOffset").getScale()
        );
        expect(offsetScale.type).toBe("band");
        expect(offsetScale.range()).toEqual([0, xScale.bandwidth() * 300]);
        expect(offsetScale.bandwidth()).toBe(75);

        renderToLayout(view, Rectangle.create(0, 0, 600, 200));

        expect(offsetScale.range()).toEqual([0, xScale.bandwidth() * 600]);
        expect(offsetScale.bandwidth()).toBe(150);
    });

    test("keeps an explicit pixel range and padding", async () => {
        const view = await createAndInitialize(
            {
                data: {
                    values: [
                        { category: "A", group: "first", value: 2 },
                        { category: "A", group: "second", value: 3 },
                    ],
                },
                mark: "rect",
                encoding: {
                    x: { field: "category", type: "nominal" },
                    y: { field: "value", type: "quantitative" },
                    xOffset: {
                        field: "group",
                        type: "nominal",
                        scale: { range: [10, 90], paddingInner: 0.2 },
                    },
                },
            },
            UnitView
        );

        const offsetScale = /** @type {any} */ (
            view.getScaleResolution("xOffset").getScale()
        );
        expect(offsetScale.range()).toEqual([10, 90]);
        expect(offsetScale.paddingInner()).toBe(0.2);
        expect(offsetScale.bandwidth()).toBeCloseTo(35.56, 2);
    });

    test("derives vertical subgroup bands in pixels", async () => {
        const view = await createAndInitialize(
            {
                data: {
                    values: [
                        { category: "A", group: "first", value: 2 },
                        { category: "A", group: "second", value: 3 },
                        { category: "B", group: "first", value: 4 },
                        { category: "B", group: "second", value: 5 },
                    ],
                },
                mark: "rect",
                encoding: {
                    x: { field: "value", type: "quantitative" },
                    y: { field: "category", type: "nominal" },
                    yOffset: { field: "group", type: "nominal" },
                },
            },
            UnitView
        );

        renderToLayout(view, Rectangle.create(0, 0, 300, 200));

        const yScale = /** @type {any} */ (
            view.getScaleResolution("y").getScale()
        );
        const offsetScale = /** @type {any} */ (
            view.getScaleResolution("yOffset").getScale()
        );
        expect(offsetScale.range()).toEqual([0, yScale.bandwidth() * 200]);
        expect(offsetScale.bandwidth()).toBe(50);
    });

    test("shares a nested scale across layered rects and points", async () => {
        const view = await createAndInitialize(
            {
                data: {
                    values: [
                        { category: "A", group: "first", value: 2 },
                        { category: "A", group: "second", value: 3 },
                    ],
                },
                encoding: {
                    x: { field: "category", type: "nominal" },
                    y: { field: "value", type: "quantitative" },
                    xOffset: { field: "group", type: "nominal" },
                },
                layer: [{ mark: "rect" }, { mark: "point" }],
            },
            LayerView
        );

        const [rect, point] = /** @type {UnitView[]} */ (view.children);
        expect(rect.getScaleResolution("xOffset")).toBe(
            point.getScaleResolution("xOffset")
        );

        const rectEncoding = /** @type {Record<string, any>} */ (
            rect.mark.encoding
        );
        const pointEncoding = /** @type {Record<string, any>} */ (
            point.mark.encoding
        );
        expect(rectEncoding.xOffset.band).toBe(0);
        expect(rectEncoding.x2Offset.band).toBe(1);
        expect(pointEncoding.xOffset.band).toBe(0.5);
    });
});
