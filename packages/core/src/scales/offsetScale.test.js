import { describe, expect, test } from "vitest";

import Rectangle from "../view/layout/rectangle.js";
import LayerView from "../view/layerView.js";
import UnitView from "../view/unitView.js";
import { createAndInitialize, renderToLayout } from "../view/testUtils.js";
import { findChannelDefWithScale } from "../encoder/encoder.js";

const GROUPED_VALUES = [
    { category: "A", group: "first", value: 2 },
    { category: "A", group: "second", value: 3 },
    { category: "B", group: "first", value: 4 },
    { category: "B", group: "second", value: 5 },
];

/**
 * Returns the horizontal position produced by the scale and its band anchor.
 * Primary positions use unit coordinates, whereas offsets use pixels.
 *
 * @param {UnitView} view
 * @param {"x" | "x2" | "xOffset" | "x2Offset"} channel
 * @param {Record<string, any>} datum
 * @param {number} unitSize
 */
function getPosition(view, channel, datum, unitSize) {
    const encoders =
        /** @type {Record<string, import("../types/encoder.js").Encoder>} */ (
            view.mark.encoders
        );
    const encoding =
        /** @type {Record<string, import("../spec/channel.js").ChannelDef>} */ (
            view.mark.encoding
        );
    const encoder = encoders[channel];
    const channelDef = findChannelDefWithScale(encoding[channel]);
    const band = /** @type {import("../spec/channel.js").BandMixins} */ (
        channelDef
    ).band;
    const scale = /** @type {any} */ (encoder.scale);
    const position = /** @type {number} */ (encoder(datum));
    const bandOffset = band * scale.bandwidth();

    return channel == "x" || channel == "x2"
        ? (position + bandOffset) * unitSize
        : position + bandOffset;
}

describe("nested offset scales", () => {
    test("derives a pixel range from the parent band and updates on resize", async () => {
        const view = await createAndInitialize(
            {
                data: { values: GROUPED_VALUES },
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
                data: { values: GROUPED_VALUES.slice(0, 2) },
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
                data: { values: GROUPED_VALUES.slice(0, 2) },
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
                data: { values: GROUPED_VALUES },
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

    test.each(
        /** @type {[string, import("../spec/channel.js").OffsetDef][]} */ ([
            ["field", { field: "group", type: "nominal" }],
            ["datum", { datum: "first", type: "nominal" }],
            ["expression", { expr: "datum.group", type: "nominal" }],
        ])
    )("supports a nested offset %s definition", async (_name, xOffset) => {
        const view = /** @type {LayerView} */ (
            await createAndInitialize(
                {
                    data: { values: GROUPED_VALUES.slice(0, 2) },
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
        renderToLayout(view, Rectangle.create(0, 0, 300, 200));
        expect(rect.getScaleResolution("xOffset")).toBe(
            point.getScaleResolution("xOffset")
        );

        // Points must remain centered on their corresponding subgroup rects.
        const datum = GROUPED_VALUES[0];
        const rectStart =
            getPosition(rect, "x", datum, 300) +
            getPosition(rect, "xOffset", datum, 300);
        const rectEnd =
            getPosition(rect, "x2", datum, 300) +
            getPosition(rect, "x2Offset", datum, 300);
        const pointPosition =
            getPosition(point, "x", datum, 300) +
            getPosition(point, "xOffset", datum, 300);

        expect(pointPosition).toBeCloseTo((rectStart + rectEnd) / 2);
    });
});
