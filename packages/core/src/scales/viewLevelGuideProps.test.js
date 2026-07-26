// @ts-nocheck

import { describe, expect, test } from "vitest";

import LayerView from "../view/layerView.js";
import { initView } from "./scaleResolutionTestUtils.js";

describe("view-level guide property attachment", () => {
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

    test("ancestor view-level axis props shadow all descendant props", async () => {
        const view = await initView(
            {
                data: { values: [{ value: 1 }] },
                axes: {
                    x: {
                        orient: "bottom",
                        grid: false,
                    },
                },
                layer: [axisLayer({ orient: "top", grid: true })],
            },
            LayerView
        );

        const resolution = view.resolutions.axis.x;

        expect(resolution.getViewLevelAxisProps()).toEqual({
            view,
            props: {
                orient: "bottom",
                grid: false,
            },
        });
        expect(resolution.getAxisProps().orient).toBe("bottom");
        expect(resolution.getAxisProps().grid).toBe(false);
    });

    test("rejects ambiguous view-level axis props", async () => {
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

    test("rejects sibling view-level axis declarations for a shared resolution", async () => {
        await expect(
            initView(
                {
                    data: { values: [{ value: 1 }] },
                    layer: [
                        axisLayer({ orient: "top" }),
                        axisLayer({ orient: "bottom" }),
                    ],
                },
                LayerView
            )
        ).rejects.toThrow(
            "Multiple view-level axis declarations target the same x axis resolution."
        );
    });

    test("rejects member axis props in the same resolution", async () => {
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

    test("ancestor view-level legend props shadow all descendant props", async () => {
        const view = await initView(
            {
                data: {
                    values: [
                        { value: 1, group: "A" },
                        { value: 2, group: "B" },
                    ],
                },
                legends: {
                    color: {
                        title: "Outer",
                        orient: "right",
                    },
                },
                layer: [
                    legendLayer({
                        title: "Inner",
                        orient: "bottom",
                    }),
                ],
            },
            LayerView
        );

        const resolution = view.resolutions.legend.color;
        const [definition] = resolution.getLegendDefs();

        expect(resolution.getViewLevelLegendProps()).toEqual({
            view,
            props: {
                title: "Outer",
                orient: "right",
            },
        });
        expect(definition.legend.title).toBe("Outer");
        expect(definition.legend.orient).toBe("right");
    });

    test("rejects member legend props in the same resolution", async () => {
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

    test("rejects sibling view-level legend declarations for a shared resolution", async () => {
        await expect(
            initView(
                {
                    data: { values: [{ group: "A" }] },
                    layer: [
                        legendLayer({ orient: "left" }),
                        legendLayer({ orient: "right" }),
                    ],
                },
                LayerView
            )
        ).rejects.toThrow(
            "Multiple view-level legend declarations target the same color legend resolution."
        );
    });
});

/**
 * @param {Partial<import("../spec/axis.js").Axis>} props
 * @returns {import("../spec/view.js").LayerSpec}
 */
function axisLayer(props) {
    return {
        axes: { x: props },
        layer: [
            {
                mark: "point",
                encoding: {
                    x: { field: "value", type: "quantitative" },
                },
            },
        ],
    };
}

/**
 * @param {import("../spec/legend.js").Legend} props
 * @returns {import("../spec/view.js").LayerSpec}
 */
function legendLayer(props) {
    return {
        legends: { color: props },
        layer: [
            {
                mark: "point",
                encoding: {
                    color: { field: "group", type: "nominal" },
                },
            },
        ],
    };
}
