// @ts-nocheck

import { describe, expect, test } from "vitest";

import LayerView from "../view/layerView.js";
import ConcatView from "../view/concatView.js";
import UnitView from "../view/unitView.js";
import {
    getRequiredScaleResolution,
    initView,
} from "./scaleResolutionTestUtils.js";

describe("Scale resolution topology", () => {
    test.each([
        {
            scaleType: "locus",
            fieldType: "nominal",
            value: "a",
            trigger: (resolution) => resolution.getAssemblyRequirement(),
        },
        {
            scaleType: "index",
            fieldType: "quantitative",
            value: 1,
            trigger: (resolution) => resolution.getScale(),
        },
    ])(
        "$scaleType scale type is rejected on non-positional channels",
        async ({ scaleType, fieldType, value, trigger }) => {
            /** @type {import("../spec/view.js").UnitSpec} */
            const spec = {
                data: { values: [{ value }] },
                mark: "point",
                encoding: {
                    x: { datum: 1, type: "quantitative" },
                    y: { datum: 1, type: "quantitative" },
                    color: {
                        field: "value",
                        type: fieldType,
                        scale: { type: scaleType },
                    },
                },
            };

            await expect(async () => {
                const view = await initView(spec, UnitView);
                trigger(getRequiredScaleResolution(view, "color"));
            }).rejects.toThrow(
                `Index and locus scales are only supported on positional channels (x/y). Channel "color" resolves to scale type "${scaleType}".`
            );
        }
    );

    test("Channels with just values (no fields or scales) do not resolve", async () => {
        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            data: { values: [] },
            resolve: {
                scale: { x: "shared" },
            },
            layer: [
                {
                    mark: "point",
                    encoding: {
                        color: { value: "red" },
                    },
                },
                {
                    mark: "point",
                    encoding: {
                        color: { value: "green" },
                    },
                },
            ],
        };
        const view = await initView(spec, LayerView);
        expect(view.children[0].getScaleResolution("color")).toBeUndefined();
        expect(view.children[1].getScaleResolution("color")).toBeUndefined();
    });

    test("Deeply shared scales are shared", async () => {
        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            data: { values: [] },
            encoding: {
                x: { field: "data", type: "quantitative" },
            },
            resolve: { scale: { x: "shared" } },
            layer: [
                {
                    resolve: { scale: { x: "shared" } },
                    layer: [{ mark: "point" }, { mark: "point" }],
                },
                {
                    resolve: { scale: { x: "shared" } },
                    layer: [{ mark: "point" }, { mark: "point" }],
                },
            ],
        };

        const view = await initView(spec, LayerView);

        expect(view.children[0].children[0].getScaleResolution("x")).toBe(
            view.children[1].children[1].getScaleResolution("x")
        );
    });

    test("Shared branches under an independent branch works as expected", async () => {
        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            data: { values: [] },
            encoding: {
                x: { field: "data", type: "quantitative" },
            },
            resolve: {
                scale: { x: "independent" },
                axis: { x: "independent" },
            },
            layer: [
                {
                    resolve: { scale: { x: "shared" } },
                    layer: [{ mark: "point" }, { mark: "point" }],
                },
                {
                    resolve: { scale: { x: "shared" } },
                    layer: [{ mark: "point" }, { mark: "point" }],
                },
            ],
        };

        const view = await initView(spec, LayerView);

        expect(view.children[0].children[0].getScaleResolution("x")).not.toBe(
            view.children[1].children[1].getScaleResolution("x")
        );
        expect(view.children[0].children[0].getScaleResolution("x")).toBe(
            view.children[0].children[1].getScaleResolution("x")
        );
        expect(view.children[1].children[0].getScaleResolution("x")).toBe(
            view.children[1].children[1].getScaleResolution("x")
        );
    });

    test("Independent branches under a shared branch works as expected", async () => {
        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            data: { values: [] },
            encoding: {
                x: { field: "data", type: "quantitative" },
            },
            resolve: {
                scale: { x: "shared" },
            },
            layer: [
                {
                    resolve: {
                        scale: { x: "independent" },
                        axis: { x: "independent" },
                    },
                    layer: [{ mark: "point" }, { mark: "point" }],
                },
                {
                    resolve: {
                        scale: { x: "independent" },
                        axis: { x: "independent" },
                    },
                    layer: [{ mark: "point" }, { mark: "point" }],
                },
            ],
        };

        const view = await initView(spec, LayerView);

        expect(view.children[0].children[0].getScaleResolution("x")).not.toBe(
            view.children[1].children[0].getScaleResolution("x")
        );
        expect(view.children[0].children[1].getScaleResolution("x")).not.toBe(
            view.children[1].children[1].getScaleResolution("x")
        );
        expect(view.children[0].children[0].getScaleResolution("x")).not.toBe(
            view.children[0].children[1].getScaleResolution("x")
        );
        expect(view.children[1].children[0].getScaleResolution("x")).not.toBe(
            view.children[1].children[1].getScaleResolution("x")
        );
    });

    test("Excluded resolution is not pushed towards the root but collects from children.", async () => {
        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            data: { values: [] },
            encoding: {
                x: { field: "data", type: "quantitative" },
            },
            resolve: {
                scale: { x: "shared" },
            },
            layer: [
                { mark: "point" },
                { mark: "point" },
                {
                    resolve: {
                        scale: { x: "excluded" },
                        axis: { x: "excluded" },
                    },
                    layer: [{ mark: "point" }, { mark: "point" }],
                },
            ],
        };

        const view = await initView(spec, LayerView);

        expect(view.children[0].getScaleResolution("x")).toBe(
            view.children[1].getScaleResolution("x")
        );
        expect(view.children[2].children[0].getScaleResolution("x")).toBe(
            view.children[2].children[1].getScaleResolution("x")
        );
        expect(view.children[0].getScaleResolution("x")).not.toBe(
            view.children[2].children[0].getScaleResolution("x")
        );
    });

    test("forced resolutions bubble to independent parents", async () => {
        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            data: { values: [] },
            resolve: {
                scale: { x: "independent" },
                axis: { x: "independent" },
            },
            layer: [
                {
                    resolve: { scale: { x: "forced" } },
                    layer: [
                        {
                            mark: "point",
                            encoding: {
                                x: { field: "data", type: "quantitative" },
                            },
                        },
                    ],
                },
                {
                    resolve: { scale: { x: "forced" } },
                    layer: [
                        {
                            mark: "point",
                            encoding: {
                                x: { field: "data", type: "quantitative" },
                            },
                        },
                    ],
                },
            ],
        };

        const view = await initView(spec, LayerView);

        expect(view.children[0].children[0].getScaleResolution("x")).toBe(
            view.children[1].children[0].getScaleResolution("x")
        );
    });

    test("forced resolutions stay separate from non-forced branches", async () => {
        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            data: { values: [] },
            resolve: {
                scale: { x: "independent" },
                axis: { x: "independent" },
            },
            layer: [
                {
                    resolve: { scale: { x: "forced" } },
                    layer: [
                        {
                            mark: "point",
                            encoding: {
                                x: { field: "data", type: "quantitative" },
                            },
                        },
                    ],
                },
                {
                    layer: [
                        {
                            mark: "point",
                            encoding: {
                                x: { field: "data", type: "quantitative" },
                            },
                        },
                    ],
                },
            ],
        };

        const view = await initView(spec, LayerView);

        expect(view.children[0].children[0].getScaleResolution("x")).not.toBe(
            view.children[1].children[0].getScaleResolution("x")
        );
    });

    test("Default resolution is configurable", async () => {
        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            data: { values: [] },
            encoding: {
                x: { field: "data", type: "quantitative" },
                y: { field: "data", type: "quantitative" },
            },
            resolve: {
                scale: {
                    default: "independent",
                    x: "shared",
                },
                axis: {
                    default: "independent",
                },
            },
            layer: [{ mark: "point" }, { mark: "point" }],
        };

        const view = await initView(spec, LayerView);

        expect(view.children[0].getScaleResolution("x")).toBe(
            view.children[1].getScaleResolution("x")
        );
        expect(view.children[0].getScaleResolution("y")).not.toBe(
            view.children[1].getScaleResolution("y")
        );
    });

    /**
     * @param {"vconcat" | "hconcat" | "concat"} viewType
     * @returns {Promise<ConcatView>}
     */
    const createConcat = async (viewType) => {
        return initView(
            {
                data: { values: [] },
                [viewType]: [
                    {
                        mark: "point",
                        encoding: {
                            x: {
                                field: "foo",
                                type: "quantitative",
                                axis: null,
                            },
                            y: {
                                field: "foo",
                                type: "quantitative",
                                axis: null,
                            },
                        },
                    },
                ],
            },
            ConcatView
        );
    };

    test.each([
        { viewType: "vconcat", channel: "x", expected: "shared" },
        { viewType: "vconcat", channel: "y", expected: "independent" },
        { viewType: "hconcat", channel: "x", expected: "independent" },
        { viewType: "hconcat", channel: "y", expected: "shared" },
        { viewType: "concat", channel: "x", expected: "independent" },
        { viewType: "concat", channel: "y", expected: "independent" },
    ])(
        "$viewType defaults $channel scale resolution to $expected",
        async ({ viewType, channel, expected }) => {
            const view = await createConcat(viewType);
            expect(view.getDefaultResolution(channel, "scale")).toBe(expected);
        }
    );
});
