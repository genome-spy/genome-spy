// @ts-nocheck

import { describe, expect, test } from "vitest";

import LayerView from "../view/layerView.js";
import { initView } from "./scaleResolutionTestUtils.js";

describe("Scale resolution named scales", () => {
    test("Resolution of shared scales with conflicting names fails with an exception", async () => {
        await expect(
            initView(
                {
                    data: { values: [1, 2] },
                    layer: [
                        {
                            mark: "point",
                            encoding: {
                                x: {
                                    field: "data",
                                    type: "quantitative",
                                    scale: { name: "scale_1" },
                                },
                            },
                        },
                        {
                            mark: "point",
                            encoding: {
                                x: {
                                    field: "data",
                                    type: "quantitative",
                                    scale: { name: "scale_2" },
                                },
                            },
                        },
                    ],
                },
                LayerView
            )
        ).rejects.toThrow(/conflicting/);
    });

    test("A name is properly registered to the ScaleResolution object", async () => {
        const view = await initView(
            {
                data: { values: [1, 2] },
                layer: [
                    {
                        mark: "point",
                        encoding: {
                            x: {
                                field: "data",
                                type: "quantitative",
                                scale: { name: "scale_1" },
                            },
                        },
                    },
                    {
                        mark: "point",
                        encoding: {
                            x: {
                                field: "data",
                                type: "quantitative",
                                scale: { name: "scale_1" },
                            },
                        },
                    },
                ],
            },
            LayerView
        );

        expect(view.getScaleResolution("x")).toHaveProperty("name", "scale_1");
    });

    test("The scale name must be unique among the scale resolutions", async () => {
        await expect(
            initView(
                {
                    resolve: {
                        scale: { x: "independent" },
                        axis: { x: "independent" },
                    },
                    data: { values: [1, 2] },
                    layer: [
                        {
                            mark: "point",
                            encoding: {
                                x: {
                                    field: "data",
                                    type: "quantitative",
                                    scale: { name: "scale_1" },
                                },
                            },
                        },
                        {
                            mark: "point",
                            encoding: {
                                x: {
                                    field: "data",
                                    type: "quantitative",
                                    scale: { name: "scale_1" },
                                },
                            },
                        },
                    ],
                },
                LayerView
            )
        ).rejects.toThrow(/multiple/);
    });
});
