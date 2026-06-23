// @ts-nocheck

import { describe, expect, test } from "vitest";

import LayerView from "../view/layerView.js";
import { initView } from "./scaleResolutionTestUtils.js";

describe("view-level guide config attachment", () => {
    test("uses view-level axis properties for a shared axis resolution", async () => {
        const view = await initView(
            {
                data: { values: [{ value: 1 }] },
                axes: {
                    x: {
                        orient: "bottom",
                        grid: false,
                        chromGrid: true,
                        chromGridDash: [3, 3],
                    },
                },
                layer: [
                    {
                        mark: "point",
                        encoding: {
                            x: { field: "value", type: "quantitative" },
                        },
                    },
                ],
            },
            LayerView
        );

        const axisProps = view.resolutions.axis.x.getAxisProps();

        expect(axisProps.orient).toBe("bottom");
        expect(axisProps.grid).toBe(false);
        expect(axisProps.chromGrid).toBe(true);
        expect(axisProps.chromGridDash).toEqual([3, 3]);
    });

    test("rejects ambiguous view-level axis config", async () => {
        await expect(
            initView(
                {
                    data: { values: [{ a: 1, b: 2 }] },
                    resolve: { axis: { x: "independent" } },
                    axes: {
                        x: { grid: true },
                    },
                    layer: [
                        {
                            mark: "point",
                            encoding: {
                                x: { field: "a", type: "quantitative" },
                            },
                        },
                        {
                            mark: "point",
                            encoding: {
                                x: { field: "b", type: "quantitative" },
                            },
                        },
                    ],
                },
                LayerView
            )
        ).rejects.toThrow(
            "View-level axes.x maps to multiple axis resolutions."
        );
    });

    test("rejects member axis config in the same resolution", async () => {
        await expect(
            initView(
                {
                    data: { values: [{ value: 1 }] },
                    axes: {
                        x: { grid: true },
                    },
                    layer: [
                        {
                            mark: "point",
                            encoding: {
                                x: {
                                    field: "value",
                                    type: "quantitative",
                                    axis: { title: "Value" },
                                },
                            },
                        },
                    ],
                },
                LayerView
            )
        ).rejects.toThrow(
            "Cannot mix view-level axes.x with encoding.x.axis in the same axis resolution."
        );
    });

    test("uses view-level legend properties for a shared legend resolution", async () => {
        const view = await initView(
            {
                data: {
                    values: [
                        { value: 1, group: "A" },
                        { value: 2, group: "B" },
                    ],
                },
                config: {
                    legend: { disable: true },
                },
                legends: {
                    color: {
                        title: "Group",
                        orient: "bottom",
                    },
                },
                layer: [
                    {
                        mark: "point",
                        encoding: {
                            x: { field: "value", type: "quantitative" },
                            color: { field: "group", type: "nominal" },
                        },
                    },
                ],
            },
            LayerView
        );

        const [definition] = view.resolutions.legend.color.getLegendDefs();

        expect(definition.legend.title).toBe("Group");
        expect(definition.legend.orient).toBe("bottom");
        expect(definition.legend.disable).toBe(false);
    });

    test("rejects member legend config in the same resolution", async () => {
        await expect(
            initView(
                {
                    data: { values: [{ group: "A" }] },
                    legends: {
                        color: { title: "Group" },
                    },
                    layer: [
                        {
                            mark: "point",
                            encoding: {
                                color: {
                                    field: "group",
                                    type: "nominal",
                                    legend: { orient: "bottom" },
                                },
                            },
                        },
                    ],
                },
                LayerView
            )
        ).rejects.toThrow(
            "Cannot mix view-level legends.color with encoding.color.legend in the same legend resolution."
        );
    });
});
