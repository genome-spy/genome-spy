import { describe, expect, test, vi } from "vitest";

import UnitView from "../view/unitView.js";
import { create } from "../view/testUtils.js";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import LayerView from "../view/layerView.js";

describe("mark factory", () => {
    test("creates arrow marks", async () => {
        const view = await create(
            {
                data: { values: [{ start: 8, end: 32, band: "A" }] },
                mark: {
                    type: "arrow",
                    headAngle: 45,
                    headNotchAngle: 90,
                    size: 12,
                    headWidth: 2,
                },
                encoding: {
                    x: { field: "start", type: "index" },
                    x2: { field: "end" },
                    y: { field: "band", type: "nominal" },
                },
            },
            UnitView
        );

        expect(view.mark.constructor.name).toBe("ArrowMark");
    });

    test("derives offset defaults and picking IDs from mark properties", async () => {
        const view = await create({ mark: "point" }, UnitView);

        expect(view.mark.encoding).toMatchObject({
            xOffset: { value: 0 },
            yOffset: { value: 0 },
            uniqueId: { field: UNIQUE_ID_KEY },
        });
    });
});

describe("supported mark channels", () => {
    /** @type {[import("../spec/mark.js").MarkType | import("../spec/mark.js").MarkProps, string][]} */
    const cases = [
        ["point", "text"],
        ["rect", "text"],
        ["rule", "text"],
        [{ type: "tick", orient: "vertical" }, "text"],
        ["text", "shape"],
        ["link", "text"],
        ["arrow", "text"],
    ];

    test.each(cases)(
        "%s filters unsupported inherited channels once in UnitView",
        async (mark, unsupportedChannel) => {
            const layer = await create(
                {
                    encoding: {
                        x: { value: 0.5 },
                        text: { value: "inherited" },
                        shape: { value: "square" },
                    },
                    layer: [{ mark }],
                },
                LayerView
            );
            const child = /** @type {UnitView} */ (Array.from(layer)[0]);

            expect(
                /** @type {Record<string, any>} */ (child.getEncoding())[
                    unsupportedChannel
                ]
            ).toBeUndefined();
            expect(
                /** @type {Record<string, any>} */ (child.mark.encoding)[
                    unsupportedChannel
                ]
            ).toBeUndefined();
        }
    );
});

describe("mark rendering revisions", () => {
    test("owns expression-backed configuration and resource revisions", async () => {
        const view = await create(
            {
                data: { values: [{ start: 8, end: 32 }] },
                params: [
                    { name: "offset", value: 0 },
                    { name: "headWidth", value: 2 },
                ],
                mark: {
                    type: "arrow",
                    headWidth: { expr: "headWidth" },
                },
                encoding: {
                    x: {
                        expr: "datum.start + offset",
                        type: "quantitative",
                    },
                    x2: { field: "end" },
                    y: { value: 0.5 },
                },
            },
            UnitView
        );

        const watchExpression = vi.spyOn(view.paramRuntime, "watchExpression");
        view.mark.initializeEncoders();
        expect(watchExpression).not.toHaveBeenCalled();
        view.mark.initializeRenderingRevisions(["headWidth"]);
        expect(watchExpression).toHaveBeenCalledTimes(2);
        expect(view.mark.getRenderingRevision("configuration")).toBe(0);
        expect(view.mark.getRenderingRevision("resources")).toBe(0);

        view.paramRuntime.setValue("offset", 1);
        expect(view.mark.getRenderingRevision("configuration")).toBe(1);
        expect(view.mark.getRenderingRevision("resources")).toBe(0);

        view.paramRuntime.setValue("headWidth", 3);
        expect(view.mark.getRenderingRevision("configuration")).toBe(1);
        expect(view.mark.getRenderingRevision("resources")).toBe(1);
    });

    test("tracks selection predicates as resource revisions", async () => {
        const view = await create(
            {
                data: { values: [{ category: "A", value: 1 }] },
                params: [{ name: "selected", select: "point" }],
                mark: "rect",
                encoding: {
                    x: { field: "category", type: "nominal" },
                    y: { field: "value", type: "quantitative" },
                    fillOpacity: {
                        value: 0.3,
                        condition: { param: "selected", value: 1 },
                    },
                },
            },
            UnitView
        );
        const requestRender = vi.spyOn(view.context.animator, "requestRender");

        view.mark.initializeEncoders();
        view.mark.initializeRenderingRevisions([]);
        expect(view.mark.getRenderingRevision("resources")).toBe(0);

        const selection = view.paramRuntime.getValue("selected");
        view.paramRuntime.setValue("selected", { ...selection });

        expect(view.mark.getRenderingRevision("resources")).toBe(1);
        expect(requestRender).toHaveBeenCalledOnce();
    });

    test("registers order selections when resource tracking starts later", async () => {
        const view = await create(
            {
                data: { values: [{ x: 1, y: 2 }] },
                params: [{ name: "picked", select: "point" }],
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    y: { field: "y", type: "quantitative" },
                    order: {
                        condition: { param: "picked", value: 1 },
                        value: 0,
                    },
                },
            },
            UnitView
        );
        const requestRender = vi.spyOn(view.context.animator, "requestRender");

        view.mark.initializeEncoders();
        view.mark.initializeRenderingRevisions([], { trackResources: false });
        view.mark.initializeRenderingRevisions([]);
        const selection = view.paramRuntime.getValue("picked");
        view.paramRuntime.setValue("picked", { ...selection });

        expect(view.mark.getRenderingRevision("resources")).toBe(1);
        expect(requestRender).toHaveBeenCalledOnce();
    });

    test("deduplicates scale dependencies", async () => {
        const view = await create(
            {
                data: { values: [{ start: 8, end: 32 }] },
                mark: "rule",
                encoding: {
                    x: { field: "start", type: "quantitative" },
                    x2: { field: "end" },
                    y: { value: 0.5 },
                },
            },
            UnitView
        );
        const resolution = view.getScaleResolution("x");
        view.mark.initializeEncoders();
        view.mark.initializeRenderingRevisions([]);

        view.paramRuntime.runInTransaction(() => {
            resolution.scale.domain([0, 20]);
            resolution.scale.range([0, 2]);
        });
        view.paramRuntime.flushNow();
        expect(view.mark.getRenderingRevision("resources")).toBe(1);
        view.disposeSubtree();
    });
});

describe("conditional order metadata", () => {
    test("sorts unequal levels and tracks union activity", async () => {
        const view = await create(
            {
                data: { values: [{ x: 1, y: 2 }] },
                params: [
                    { name: "picked", select: "point" },
                    { name: "brush", select: "point" },
                ],
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    y: { field: "y", type: "quantitative" },
                    order: {
                        condition: {
                            test: {
                                param: {
                                    or: /** @type {[string, ...string[]]} */ ([
                                        "picked",
                                        "picked",
                                        "brush",
                                    ]),
                                },
                                empty: false,
                            },
                            value: -4,
                        },
                        value: 12,
                    },
                },
            },
            UnitView
        );

        const order = /** @type {UnitView} */ (view).mark.getOrder();
        /** @type {UnitView} */ (view).mark.initializeEncoders();
        expect(
            /** @type {UnitView} */ (view).mark.encoders.order
        ).toBeUndefined();
        expect(order).toMatchObject({
            params: ["picked", "brush"],
            passes: ["matching", "nonmatching"],
        });
        expect(order.isActive()).toBe(false);

        view.paramRuntime.setValue("picked", {
            type: "single",
            datum: { x: 1, y: 2 },
            uniqueId: 1,
        });
        expect(order.isActive()).toBe(true);
    });

    test.each([
        [{ value: 0 }, undefined],
        [{ condition: { param: "picked", value: 2 }, value: 2 }, undefined],
    ])("folds inert order definitions", async (definition, expected) => {
        const view = await create(
            {
                data: { values: [{ x: 1, y: 2 }] },
                params: [{ name: "picked", select: "point" }],
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    y: { field: "y", type: "quantitative" },
                    order: /** @type {any} */ (definition),
                },
            },
            UnitView
        );

        expect(/** @type {UnitView} */ (view).mark.getOrder()).toBe(expected);
    });

    test("rejects non-finite and unsupported order definitions", async () => {
        const base = {
            data: { values: [{ x: 1, y: 2 }] },
            params: [{ name: "picked", select: "point" }],
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative" },
                y: { field: "y", type: "quantitative" },
            },
        };

        for (const order of [
            { value: Infinity },
            { value: 0, condition: { field: "x", value: 1 } },
            { value: 0, condition: { param: "picked", value: NaN } },
        ]) {
            const view = await create(
                /** @type {any} */ ({
                    ...base,
                    encoding: /** @type {any} */ ({
                        ...base.encoding,
                        order: /** @type {any} */ (order),
                    }),
                }),
                UnitView
            );
            expect(() =>
                /** @type {UnitView} */ (view).mark.getOrder()
            ).toThrow();
        }
    });
});

describe("mark positional endpoints", () => {
    test("rejects a visual y value with a scale-backed y2 endpoint", async () => {
        await expect(
            create(
                {
                    data: { values: [{ pos: 1, count: 3 }] },
                    mark: "rule",
                    encoding: {
                        x: { field: "pos", type: "quantitative" },
                        y: { value: 0 },
                        y2: { field: "count", type: "quantitative" },
                    },
                },
                UnitView
            )
        ).rejects.toThrow(
            /Cannot combine encoding\.y\.value with scale-backed encoding\.y2.*encoding\.y\.datum/
        );
    });

    test("rejects a visual x value with a scale-backed x2 endpoint", async () => {
        await expect(
            create(
                {
                    data: { values: [{ pos: 1, count: 3 }] },
                    mark: "rule",
                    encoding: {
                        x: { value: 0 },
                        x2: { field: "pos", type: "quantitative" },
                        y: { field: "count", type: "quantitative" },
                    },
                },
                UnitView
            )
        ).rejects.toThrow(
            /Cannot combine encoding\.x\.value with scale-backed encoding\.x2.*encoding\.x\.datum/
        );
    });

    test("allows a scaled primary endpoint with a visual secondary endpoint", async () => {
        const view = await create(
            {
                data: { values: [{ pos: 1, count: 3 }] },
                mark: "rule",
                encoding: {
                    x: { field: "pos", type: "quantitative" },
                    y: { field: "count", type: "quantitative" },
                    y2: { value: 0 },
                },
            },
            UnitView
        );

        expect(() => view.mark.encoding).not.toThrow();
    });
});

describe("mark positional offsets", () => {
    test("inherits the primary offset for an implicit secondary endpoint", async () => {
        const view = await create(
            {
                data: { values: [{ category: "A", value: 3 }] },
                mark: "rect",
                encoding: {
                    x: { field: "category", type: "nominal" },
                    y: { field: "value", type: "quantitative" },
                    xOffset: {
                        field: "category",
                        type: "nominal",
                        scale: { range: [-6, 6] },
                    },
                },
            },
            UnitView
        );

        const encoding = /** @type {Record<string, any>} */ (
            view.mark.encoding
        );
        expect(encoding.x2Offset).toEqual({
            ...encoding.xOffset,
            band: 1,
            resolutionChannel: "xOffset",
        });
    });

    test("defaults the secondary offset to zero for an explicit endpoint", async () => {
        const view = await create(
            {
                data: { values: [{ start: 1, end: 2 }] },
                mark: "rule",
                encoding: {
                    x: { field: "start", type: "quantitative" },
                    x2: { field: "end" },
                    xOffset: { value: 7 },
                },
            },
            UnitView
        );

        const encoding = /** @type {Record<string, any>} */ (
            view.mark.encoding
        );
        expect(encoding.x2Offset).toEqual({ value: 0 });
    });

    test("honors an explicit zero secondary offset property", async () => {
        const view = await create(
            {
                data: { values: [{ category: "A", value: 3 }] },
                mark: { type: "rect", xOffset: 8, x2Offset: 0 },
                encoding: {
                    x: { field: "category", type: "nominal" },
                    y: { field: "value", type: "quantitative" },
                },
            },
            UnitView
        );

        const encoding = /** @type {Record<string, any>} */ (
            view.mark.encoding
        );
        expect(encoding.xOffset).toEqual({ value: 8 });
        expect(encoding.x2Offset).toEqual({ value: 0 });
    });

    test.each([
        ["dx", "xOffset"],
        ["dy", "yOffset"],
    ])("rejects legacy point %s with %s", async (legacy, offset) => {
        await expect(
            create(
                {
                    mark: { type: "point", [offset]: 2 },
                    encoding: {
                        [legacy]: { value: 3 },
                    },
                },
                UnitView
            )
        ).rejects.toThrow(
            `Point marks cannot combine legacy ${legacy} with ${offset}`
        );
    });

    test("allows legacy and new offsets on different axes", async () => {
        const view = await create(
            {
                mark: { type: "point", yOffset: 2 },
                encoding: {
                    dx: { value: 3 },
                },
            },
            UnitView
        );

        expect(view.mark.encoding).toMatchObject({
            dx: { value: 3 },
            yOffset: { value: 2 },
        });
    });
});
