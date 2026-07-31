import { describe, expect, test } from "vitest";

import { getSizeDefMinPx } from "../layout/flexLayout.js";
import Rectangle from "../layout/rectangle.js";
import { translateLegendCoords } from "./legendLayout.js";
import {
    GuideRecordingRenderingContext,
    LegendRecordingRenderingContext,
    createLegendTestView,
    getLegendRegions,
    getLegends,
} from "./legendTestUtils.js";

describe("legend regions", () => {
    test("stacks same-region legends with a gap and data-driven height", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            {
                                x: 1,
                                signal: 2,
                                trend: 3,
                                group: "alpha",
                                difference: 0,
                            },
                            {
                                x: 2,
                                signal: 3,
                                trend: 4,
                                group: "beta",
                                difference: 100,
                            },
                        ],
                    },
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                    layer: [
                        {
                            mark: "point",
                            encoding: {
                                y: {
                                    field: "signal",
                                    type: "quantitative",
                                },
                                color: {
                                    field: "group",
                                    type: "nominal",
                                    legend: { title: "Group" },
                                },
                            },
                        },
                        {
                            mark: "point",
                            encoding: {
                                y: {
                                    field: "trend",
                                    type: "quantitative",
                                },
                                size: {
                                    field: "difference",
                                    type: "quantitative",
                                    scale: { range: [100, 2500] },
                                    legend: { title: "Difference" },
                                },
                            },
                        },
                    ],
                },
            ],
        });
        const [region] = getLegendRegions(view);
        const legendHeights = getLegends(view).map((legend) =>
            legend.getStackedParallelSize()
        );

        expect(region.getParallelSize()).toBe(
            legendHeights.reduce((sum, height) => sum + height, 0) + 10
        );
        expect(legendHeights.at(-1)).toBeGreaterThan(100);
    });

    test("packs top and bottom legend regions horizontally by default", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            {
                                x: 1,
                                signal: 2,
                                trend: 3,
                                group: "alpha",
                                difference: 1,
                            },
                            {
                                x: 2,
                                signal: 3,
                                trend: 4,
                                group: "beta",
                                difference: 2,
                            },
                        ],
                    },
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                    layer: [
                        {
                            mark: "point",
                            encoding: {
                                y: {
                                    field: "signal",
                                    type: "quantitative",
                                },
                                color: {
                                    field: "group",
                                    type: "nominal",
                                    legend: { orient: "bottom" },
                                },
                            },
                        },
                        {
                            mark: "point",
                            encoding: {
                                y: {
                                    field: "trend",
                                    type: "quantitative",
                                },
                                size: {
                                    field: "difference",
                                    type: "quantitative",
                                    legend: { orient: "bottom" },
                                },
                            },
                        },
                    ],
                },
            ],
        });
        const [region] = getLegendRegions(view);
        const legends = getLegends(view);
        const legendHeights = legends.map((legend) =>
            getSizeDefMinPx(legend.getSize().height)
        );
        const legendWidths = legends.map((legend) =>
            getSizeDefMinPx(legend.getSize().width)
        );

        expect(region.getPerpendicularSize()).toBe(Math.max(...legendHeights));
        expect(region.getWidth()).toBe(
            legendWidths.reduce((sum, width) => sum + width, 0) + 10
        );

        const context = new LegendRecordingRenderingContext({
            picking: false,
        });
        region.render(context, Rectangle.create(0, 0, 300, 80));
        const coords = Array.from(context.legendCoords.values());

        expect(coords).toHaveLength(2);
        expect(coords[0].x).toBe(0);
        expect(coords[0].width).toBe(legendWidths[0]);
        expect(coords[1].width).toBe(legendWidths[1]);
        expect(coords[1].x - coords[0].x - coords[0].width).toBe(10);
        expect(coords[0].y).toBe(coords[1].y);
    });

    test("anchors stacks independently of their layout direction", async () => {
        for (const [orient, direction] of /** @type {const} */ ([
            ["top", "vertical"],
            ["right", "horizontal"],
        ])) {
            const view = await createLegendTestView({
                config: {
                    legend: {
                        disable: false,
                        layout: {
                            [orient]: { anchor: "middle", direction },
                        },
                    },
                },
                vconcat: [
                    {
                        data: {
                            values: [
                                { x: 1, y: 2, group: "A", kind: "one" },
                                { x: 2, y: 3, group: "B", kind: "two" },
                            ],
                        },
                        mark: "point",
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            y: { field: "y", type: "quantitative" },
                            color: {
                                field: "group",
                                type: "nominal",
                                legend: { orient },
                            },
                            shape: {
                                field: "kind",
                                type: "nominal",
                                legend: { orient },
                            },
                        },
                    },
                ],
            });
            const [region] = getLegendRegions(view);
            const viewport = Rectangle.create(10, 20, 300, 200);
            const parallelSize = region.getParallelSize();
            if (parallelSize === undefined) {
                throw new Error("Expected a fixed-size legend stack");
            }

            const coords = translateLegendCoords(viewport, orient, region);

            expect(region.getAnchor()).toBe("middle");
            if (orient == "top") {
                expect(coords.x).toBe(
                    viewport.x + (viewport.width - parallelSize) / 2
                );
                expect(coords.width).toBe(parallelSize);
            } else {
                expect(coords.y).toBe(
                    viewport.y + (viewport.height - parallelSize) / 2
                );
                expect(coords.height).toBe(parallelSize);
            }
        }
    });

    test("lets an adaptive top gradient fill the available width", async () => {
        const view = await createLegendTestView({
            config: {
                legend: {
                    disable: false,
                    layout: { top: { anchor: "end" } },
                },
            },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, value: 10 },
                            { x: 2, y: 3, value: 20 },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "value",
                            type: "quantitative",
                            legend: {
                                orient: "top",
                                direction: "horizontal",
                            },
                        },
                    },
                },
            ],
        });
        const [legend] = getLegends(view);
        const [region] = getLegendRegions(view);

        expect(legend.getSize().width.grow).toBe(1);
        expect(region.getParallelSize()).toBeUndefined();

        const regionCoords = translateLegendCoords(
            Rectangle.create(0, 0, 300, 200),
            "top",
            region
        );
        expect(regionCoords.x).toBe(0);
        expect(regionCoords.width).toBe(300);

        const context = new LegendRecordingRenderingContext({
            picking: false,
        });
        region.render(context, Rectangle.create(0, 0, 300, 80));

        expect(context.legendCoords.get(legend)?.width).toBe(300);
    });

    test("keeps a vertical top gradient at its natural length", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, value: 10 },
                            { x: 2, y: 3, value: 20 },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "value",
                            type: "quantitative",
                            legend: { orient: "top" },
                        },
                    },
                },
            ],
        });
        const [legend] = getLegends(view);

        expect(legend.legendProps.direction).toBe("vertical");
        expect(legend.getSize().height).toEqual({
            px: legend.getStackedParallelSize(),
        });
    });

    test("gives remaining horizontal region width to an adaptive gradient", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, group: "A", value: 10 },
                            { x: 2, y: 3, group: "B", value: 20 },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        shape: {
                            field: "group",
                            type: "nominal",
                            legend: {
                                orient: "top",
                                direction: "horizontal",
                                title: "Symbol",
                            },
                        },
                        color: {
                            field: "value",
                            type: "quantitative",
                            legend: {
                                orient: "top",
                                direction: "horizontal",
                                title: "Gradient",
                            },
                        },
                    },
                },
            ],
        });
        const legends = getLegends(view);
        const symbolLegend = legends.find(
            (legend) => legend.legendProps.title == "Symbol"
        );
        const gradientLegend = legends.find(
            (legend) => legend.legendProps.title == "Gradient"
        );
        if (!symbolLegend || !gradientLegend) {
            throw new Error("Expected symbol and gradient legends");
        }

        const [region] = getLegendRegions(view);
        const context = new LegendRecordingRenderingContext({
            picking: false,
        });
        region.render(context, Rectangle.create(0, 0, 320, 80));

        const symbolCoords = context.legendCoords.get(symbolLegend);
        const gradientCoords = context.legendCoords.get(gradientLegend);
        if (!symbolCoords || !gradientCoords) {
            throw new Error("Expected both legends to render");
        }

        const [left, right] = [symbolCoords, gradientCoords].sort(
            (a, b) => a.x - b.x
        );
        expect(symbolCoords.width).toBe(symbolLegend.getStackedParallelSize());
        expect(right.x - left.x - left.width).toBe(10);
        expect(symbolCoords.width + gradientCoords.width + 10).toBe(320);
    });

    test("supports vertical packing for a bottom legend region", async () => {
        const view = await createLegendTestView({
            config: {
                legend: {
                    disable: false,
                    layout: { bottom: { direction: "vertical" } },
                },
            },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, group: "a", amount: 10 },
                            { x: 2, y: 3, group: "b", amount: 20 },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "group",
                            type: "nominal",
                            legend: { orient: "bottom" },
                        },
                        size: {
                            field: "amount",
                            type: "quantitative",
                            legend: { orient: "bottom" },
                        },
                    },
                },
            ],
        });
        const [region] = getLegendRegions(view);
        const legendHeights = getLegends(view).map((legend) =>
            getSizeDefMinPx(legend.getSize().height)
        );

        expect(region.getPerpendicularSize()).toBe(
            legendHeights.reduce((sum, height) => sum + height, 0) + 10
        );
    });

    test("stacks local bottom legends outside shared bottom axes", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            resolve: {
                axis: { x: "shared" },
                legend: { color: "independent" },
            },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2 },
                            { x: 2, y: 3 },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                    },
                },
                {
                    data: {
                        values: [
                            { x: 1, y: 2, group: "alpha" },
                            { x: 2, y: 3, group: "beta" },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "group",
                            type: "nominal",
                            legend: { orient: "bottom" },
                        },
                    },
                },
            ],
        });

        const context = new GuideRecordingRenderingContext({
            picking: false,
        });
        view.render(context, Rectangle.create(0, 0, 300, 300), {
            firstFacet: true,
        });

        const [legendCoords] = context.legendCoords.values();
        const axisCoords = context.axes.find(
            ({ axis }) => axis.axisProps.orient == "bottom"
        )?.coords;
        if (!legendCoords || !axisCoords) {
            throw new Error("Expected a bottom legend and bottom axis!");
        }

        expect(legendCoords.y).toBeGreaterThanOrEqual(axisCoords.y2);
    });
});
