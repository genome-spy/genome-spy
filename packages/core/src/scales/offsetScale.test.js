import { describe, expect, test } from "vitest";

import Rectangle from "../view/layout/rectangle.js";
import LayerView from "../view/layerView.js";
import UnitView from "../view/unitView.js";
import { createAndInitialize, renderToLayout } from "../view/testUtils.js";
import { findChannelDefWithScale } from "../encoder/encoder.js";

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
        expect(xScale.paddingInner()).toBe(0.2);
        expect(xScale.paddingOuter()).toBe(0.2);
        expect(offsetScale.range()).toEqual([0, xScale.bandwidth() * 300]);
        expect(offsetScale.bandwidth()).toBeCloseTo(
            (xScale.bandwidth() * 300) / 2
        );
        renderToLayout(view, Rectangle.create(0, 0, 600, 200));

        expect(offsetScale.range()).toEqual([0, xScale.bandwidth() * 600]);
        expect(offsetScale.bandwidth()).toBeCloseTo(
            (xScale.bandwidth() * 600) / 2
        );
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

    test("preserves explicit primary band padding", async () => {
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
                    x: {
                        field: "category",
                        type: "nominal",
                        scale: { paddingInner: 0.4, paddingOuter: 0.1 },
                    },
                    y: { field: "value", type: "quantitative" },
                    xOffset: { field: "group", type: "nominal" },
                },
            },
            UnitView
        );

        const xScale = /** @type {any} */ (
            view.getScaleResolution("x").getScale()
        );
        expect(xScale.paddingInner()).toBe(0.4);
        expect(xScale.paddingOuter()).toBe(0.1);
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
        expect(yScale.paddingInner()).toBe(0.2);
        expect(yScale.paddingOuter()).toBe(0.2);
        expect(offsetScale.range()).toEqual([0, yScale.bandwidth() * 200]);
        expect(offsetScale.bandwidth()).toBeCloseTo(
            (yScale.bandwidth() * 200) / 2
        );
    });

    test("keeps an explicit secondary endpoint independent", async () => {
        const view = await createAndInitialize(
            {
                data: {
                    values: [
                        {
                            category: "A",
                            category2: "B",
                            group: "first",
                            value: 2,
                        },
                    ],
                },
                mark: "rect",
                encoding: {
                    x: { field: "category", type: "nominal" },
                    x2: { field: "category2" },
                    y: { field: "value", type: "quantitative" },
                    xOffset: { field: "group", type: "nominal" },
                },
            },
            UnitView
        );

        const encoding = /** @type {Record<string, any>} */ (
            view.mark.encoding
        );
        expect(encoding.x2.field).toBe("category2");
        expect(encoding.x2Offset).toEqual({ value: 0 });
    });

    test.each(
        /** @type {[string, import("../spec/channel.js").OffsetDef][]} */ ([
            ["datum", { datum: "first", type: "nominal" }],
            ["expression", { expr: "datum.group", type: "nominal" }],
        ])
    )("supports a nested offset %s definition", async (_name, xOffset) => {
        const view = /** @type {LayerView} */ (
            await createAndInitialize(
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
                        xOffset,
                    },
                    layer: [{ mark: "rect" }, { mark: "point" }],
                },
                LayerView
            )
        );

        const [rect, point] = /** @type {UnitView[]} */ (view.children);
        const rectEncoding = /** @type {Record<string, any>} */ (
            rect.mark.encoding
        );
        const pointEncoding = /** @type {Record<string, any>} */ (
            point.mark.encoding
        );
        const secondaryOffsetDef = /** @type {any} */ (
            findChannelDefWithScale(rectEncoding.x2Offset)
        );

        expect(secondaryOffsetDef.resolutionChannel).toBe("xOffset");
        expect(secondaryOffsetDef.band).toBe(1);
        expect(
            /** @type {any} */ (findChannelDefWithScale(pointEncoding.x)).band
        ).toBe(0);
        expect(
            /** @type {any} */ (findChannelDefWithScale(pointEncoding.xOffset))
                .band
        ).toBe(0.5);
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
        expect(pointEncoding.x.band).toBe(rectEncoding.x.band);
        expect(pointEncoding.xOffset.band).toBe(
            (rectEncoding.xOffset.band + rectEncoding.x2Offset.band) / 2
        );
    });
});
