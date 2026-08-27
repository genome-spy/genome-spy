// @ts-nocheck

import { describe, expect, test } from "vitest";

import ConcatView from "../view/concatView.js";
import LayerView from "../view/layerView.js";
import UnitView from "../view/unitView.js";
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
});
