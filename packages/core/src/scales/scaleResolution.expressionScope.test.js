// @ts-nocheck

import { describe, expect, test } from "vitest";

import ConcatView from "../view/concatView.js";
import LayerView from "../view/layerView.js";
import Rectangle from "../view/layout/rectangle.js";
import UnitView from "../view/unitView.js";
import { renderToLayout } from "../view/testUtils.js";
import {
    getRequiredScaleResolution,
    initView,
} from "./scaleResolutionTestUtils.js";

describe("scale resolution expression scope", () => {
    test("independent scales use the unit scope", async () => {
        const view = await initView(
            {
                params: [{ name: "rangeEnd", value: 10 }],
                data: { values: [{ value: 0 }, { value: 1 }] },
                mark: "point",
                encoding: {
                    size: {
                        field: "value",
                        type: "quantitative",
                        scale: {
                            domain: [0, 1],
                            range: [0, { expr: "rangeEnd" }],
                        },
                    },
                },
            },
            UnitView
        );
        const resolution = getRequiredScaleResolution(view, "size");

        expect(resolution.getScale().range()).toEqual([0, 10]);

        view.paramRuntime.setValue("rangeEnd", 20);
        await view.paramRuntime.whenPropagated();

        expect(resolution.getScale().range()).toEqual([0, 20]);
    });

    test("shared scales use their owner instead of shadowing children", async () => {
        const view = await initView(
            {
                params: [{ name: "rangeEnd", value: 10 }],
                data: { values: [{ value: 0 }, { value: 1 }] },
                layer: [
                    {
                        params: [{ name: "rangeEnd", value: 2 }],
                        mark: "point",
                        encoding: {
                            x: {
                                field: "value",
                                type: "quantitative",
                            },
                            size: {
                                field: "value",
                                type: "quantitative",
                                scale: {
                                    domain: [0, 1],
                                    range: [0, { expr: "rangeEnd" }],
                                },
                            },
                        },
                    },
                    {
                        params: [{ name: "rangeEnd", value: 3 }],
                        mark: "point",
                        encoding: {
                            size: {
                                field: "value",
                                type: "quantitative",
                            },
                        },
                    },
                ],
            },
            LayerView
        );
        const resolution = getRequiredScaleResolution(view, "size");

        expect(resolution.getScale().range()).toEqual([0, 10]);

        view.children[0].paramRuntime.setValue("rangeEnd", 20);
        view.children[1].paramRuntime.setValue("rangeEnd", 30);
        await view.paramRuntime.whenPropagated();

        expect(resolution.getScale().range()).toEqual([0, 10]);
    });

    test("shared scales can use ancestor parameters with owner shadowing", async () => {
        const view = await initView(
            {
                params: [{ name: "rangeEnd", value: 12 }],
                resolve: { scale: { size: "independent" } },
                vconcat: [
                    {
                        params: [{ name: "rangeEnd", value: 8 }],
                        data: { values: [{ value: 0 }, { value: 1 }] },
                        layer: [
                            {
                                mark: "point",
                                encoding: {
                                    size: {
                                        field: "value",
                                        type: "quantitative",
                                        scale: {
                                            domain: [0, 1],
                                            range: [0, { expr: "rangeEnd" }],
                                        },
                                    },
                                },
                            },
                            {
                                mark: "point",
                                encoding: {
                                    size: {
                                        field: "value",
                                        type: "quantitative",
                                    },
                                },
                            },
                        ],
                    },
                    {
                        data: { values: [{ value: 0 }, { value: 1 }] },
                        layer: [
                            {
                                mark: "point",
                                encoding: {
                                    size: {
                                        field: "value",
                                        type: "quantitative",
                                        scale: {
                                            domain: [0, 1],
                                            range: [0, { expr: "rangeEnd" }],
                                        },
                                    },
                                },
                            },
                            {
                                mark: "point",
                                encoding: {
                                    size: {
                                        field: "value",
                                        type: "quantitative",
                                    },
                                },
                            },
                        ],
                    },
                ],
            },
            ConcatView
        );

        expect(
            getRequiredScaleResolution(view.children[0], "size")
                .getScale()
                .range()
        ).toEqual([0, 8]);
        expect(
            getRequiredScaleResolution(view.children[1], "size")
                .getScale()
                .range()
        ).toEqual([0, 12]);
    });

    test("child-local parameters cannot control shared ranges", async () => {
        await expect(
            initView(
                {
                    data: { values: [{ value: 0 }, { value: 1 }] },
                    layer: [
                        {
                            params: [{ name: "rangeEnd", value: 10 }],
                            mark: "point",
                            encoding: {
                                size: {
                                    field: "value",
                                    type: "quantitative",
                                    scale: {
                                        domain: [0, 1],
                                        range: [0, { expr: "rangeEnd" }],
                                    },
                                },
                            },
                        },
                        {
                            mark: "point",
                            encoding: {
                                size: {
                                    field: "value",
                                    type: "quantitative",
                                },
                            },
                        },
                    ],
                },
                LayerView
            )
        ).rejects.toThrow(
            'Parameter "rangeEnd" is not visible from the shared size scale resolution. ' +
                'Move the parameter to the resolution-owning view and use push: "outer" if a child must update it.'
        );
    });

    test("a child can push updates to a shared range owner", async () => {
        const view = await initView(
            {
                params: [{ name: "rangeEnd", value: 10 }],
                data: { values: [{ value: 0 }, { value: 1 }] },
                layer: [
                    {
                        params: [{ name: "rangeEnd", push: "outer" }],
                        mark: "point",
                        encoding: {
                            size: {
                                field: "value",
                                type: "quantitative",
                                scale: {
                                    domain: [0, 1],
                                    range: [0, { expr: "rangeEnd" }],
                                },
                            },
                        },
                    },
                    {
                        mark: "point",
                        encoding: {
                            size: {
                                field: "value",
                                type: "quantitative",
                            },
                        },
                    },
                ],
            },
            LayerView
        );
        const resolution = getRequiredScaleResolution(view, "size");

        view.children[0].paramRuntime.setValue("rangeEnd", 20);
        await view.paramRuntime.whenPropagated();

        expect(resolution.getScale().range()).toEqual([0, 20]);
    });

    test("configured domain arrays use the shared owner scope", async () => {
        const view = await initView(
            {
                params: [{ name: "upperBound", value: 10 }],
                data: { values: [] },
                layer: [
                    {
                        params: [{ name: "upperBound", value: 2 }],
                        mark: "point",
                        encoding: {
                            y: {
                                field: "a",
                                type: "quantitative",
                                scale: {
                                    domain: [
                                        { expr: "0" },
                                        { expr: "upperBound" },
                                    ],
                                },
                            },
                        },
                    },
                    {
                        mark: "point",
                        encoding: {
                            y: {
                                field: "b",
                                type: "quantitative",
                            },
                        },
                    },
                ],
            },
            LayerView
        );
        const resolution = getRequiredScaleResolution(view, "y");

        expect(resolution.getScale().domain()).toEqual([0, 10]);

        view.paramRuntime.setValue("upperBound", 20);
        await view.paramRuntime.whenPropagated();

        expect(resolution.getScale().domain()).toEqual([0, 20]);
    });

    test("child-local parameters cannot control shared domains", async () => {
        await expect(
            initView(
                {
                    data: { values: [] },
                    layer: [
                        {
                            params: [{ name: "upperBound", value: 10 }],
                            mark: "point",
                            encoding: {
                                y: {
                                    field: "a",
                                    type: "quantitative",
                                    scale: {
                                        domain: [0, { expr: "upperBound" }],
                                    },
                                },
                            },
                        },
                        {
                            mark: "point",
                            encoding: {
                                y: {
                                    field: "b",
                                    type: "quantitative",
                                },
                            },
                        },
                    ],
                },
                LayerView
            )
        ).rejects.toThrow(
            'Parameter "upperBound" is not visible from the shared y scale resolution. ' +
                'Move the parameter to the resolution-owning view and use push: "outer" if a child must update it.'
        );
    });

    test("dynamic members rebind range expressions without leaking removed listeners", async () => {
        const view = await initView(
            {
                params: [{ name: "rangeEnd", value: 10 }],
                data: { values: [{ value: 0 }, { value: 1 }] },
                layer: [
                    {
                        name: "base",
                        mark: "point",
                        encoding: {
                            size: {
                                field: "value",
                                type: "quantitative",
                            },
                        },
                    },
                ],
            },
            LayerView
        );
        const resolution = getRequiredScaleResolution(view, "size");
        const baselineRange = resolution.getScale().range();

        const inserted = await view.addChildSpec({
            name: "reactive",
            mark: "point",
            encoding: {
                size: {
                    field: "value",
                    type: "quantitative",
                    scale: {
                        domain: [0, 1],
                        range: [0, { expr: "rangeEnd" }],
                    },
                },
            },
        });

        expect(inserted.getScaleResolution("size")).toBe(resolution);
        expect(resolution.getScale().range()).toEqual([0, 10]);

        view.paramRuntime.setValue("rangeEnd", 20);
        await view.paramRuntime.whenPropagated();
        expect(resolution.getScale().range()).toEqual([0, 20]);

        await view.removeChildAt(1);
        expect(resolution.getScale().range()).toEqual(baselineRange);

        view.paramRuntime.setValue("rangeEnd", 30);
        await view.paramRuntime.whenPropagated();
        expect(resolution.getScale().range()).toEqual(baselineRange);
    });

    test("failed child-local insertion leaves an initialized resolution unchanged", async () => {
        const view = await initView(
            {
                data: { values: [{ value: 0 }, { value: 1 }] },
                layer: [
                    {
                        name: "base",
                        mark: "point",
                        encoding: {
                            x: {
                                field: "value",
                                type: "quantitative",
                            },
                            size: {
                                field: "value",
                                type: "quantitative",
                            },
                        },
                    },
                ],
            },
            LayerView
        );
        const resolution = getRequiredScaleResolution(view, "size");
        const xResolution = getRequiredScaleResolution(view, "x");
        const baselineRange = resolution.getScale().range();

        await expect(
            view.addChildSpec({
                name: "invalid",
                params: [{ name: "childRangeEnd", value: 10 }],
                mark: "point",
                encoding: {
                    x: {
                        field: "value",
                        type: "quantitative",
                    },
                    size: {
                        field: "value",
                        type: "quantitative",
                        scale: {
                            domain: [0, 1],
                            range: [0, { expr: "childRangeEnd" }],
                        },
                    },
                },
            })
        ).rejects.toThrow(
            'Parameter "childRangeEnd" is not visible from the shared size scale resolution.'
        );

        expect(view.children.map((child) => child.name)).toEqual(["base"]);
        expect(resolution.getOrderedMembers()).toHaveLength(1);
        expect(xResolution.getOrderedMembers()).toHaveLength(1);
        expect(resolution.getScale().range()).toEqual(baselineRange);
    });

    test("owner-level sashimi domains react to owner geometry and x domains", async () => {
        const view = await initView(
            {
                scales: { x: { domain: [0, 10] } },
                resolve: {
                    scale: { y: "independent" },
                    axis: { y: "independent" },
                },
                layer: [
                    {
                        data: { values: [{ x: 0, value: 1 }] },
                        mark: "point",
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            y: { field: "value", type: "quantitative" },
                        },
                    },
                    {
                        name: "splice-junctions",
                        scales: {
                            y: {
                                type: "sqrt",
                                domain: {
                                    expr: "[0, span(domain('x')) * height / width * 5]",
                                },
                            },
                        },
                        data: {
                            values: [
                                { start: 0, end: 5, span: 5 },
                                { start: 5, end: 10, span: 5 },
                            ],
                        },
                        layer: [
                            {
                                name: "arcs",
                                mark: "link",
                                encoding: {
                                    x: {
                                        field: "start",
                                        type: "quantitative",
                                    },
                                    x2: { field: "end" },
                                    y: {
                                        field: "span",
                                        type: "quantitative",
                                        axis: null,
                                    },
                                },
                            },
                            {
                                name: "labels",
                                mark: "text",
                                encoding: {
                                    x: {
                                        field: "start",
                                        type: "quantitative",
                                    },
                                    y: {
                                        field: "span",
                                        type: "quantitative",
                                    },
                                    text: { field: "span" },
                                },
                            },
                        ],
                    },
                ],
            },
            LayerView
        );
        const spliceJunctions = view.children[1];
        const yResolution = getRequiredScaleResolution(spliceJunctions, "y");
        const xResolution = getRequiredScaleResolution(view, "x");

        expect(yResolution.getViewLevelScaleProps()?.view).toBe(
            spliceJunctions
        );

        renderToLayout(view, Rectangle.create(0, 0, 400, 200));
        await view.paramRuntime.whenPropagated();
        const wideDomainMax = yResolution.getScale().domain()[1];

        renderToLayout(view, Rectangle.create(0, 0, 200, 200));
        await view.paramRuntime.whenPropagated();
        const narrowDomainMax = yResolution.getScale().domain()[1];

        expect(narrowDomainMax).toBeGreaterThan(wideDomainMax);

        xResolution.getScale().domain([0, 5]);
        await view.paramRuntime.whenPropagated();

        expect(yResolution.getScale().domain()[1]).toBeCloseTo(
            narrowDomainMax / 2
        );
    });
});
