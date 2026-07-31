import { describe, expect, test } from "vitest";

import Rectangle from "../layout/rectangle.js";
import UnitView from "../unitView.js";
import createScale from "../../scale/scale.js";
import {
    LegendRecordingRenderingContext,
    MarkRecordingRenderingContext,
    createLegendTestView,
    getLegendChild,
    getLegendData,
    getLegendRegions,
    getLegendUnitChild,
    getLegends,
    getUnitData,
} from "./legendTestUtils.js";

describe("gradient legends", () => {
    test("creates an opt-in gradient legend for quantitative color", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, measurement: 0 },
                            { x: 2, y: 3, measurement: 1 },
                        ],
                    },
                    mark: "rect",
                    encoding: {
                        x: { field: "x", type: "index" },
                        y: { field: "y", type: "index" },
                        color: {
                            field: "measurement",
                            type: "quantitative",
                        },
                    },
                },
            ],
        });
        const legends = getLegends(view);
        const ramp = getLegendUnitChild(legends[0], "gradientRamp");
        const labels = getLegendUnitChild(legends[0], "gradientLabels");
        const plot = view
            .getDescendants()
            .find((descendant) => descendant.name == "grid0");

        expect(legends).toHaveLength(1);
        expect(ramp).toBeInstanceOf(UnitView);
        expect(labels).toBeInstanceOf(UnitView);
        expect(plot).toBeInstanceOf(UnitView);
        expect(
            /** @type {UnitView} */ (ramp).getScaleResolution("y").getScale()
                .props
        ).toEqual(expect.objectContaining({ domainTransition: false }));
        expect(/** @type {UnitView} */ (ramp).getScaleResolution("color")).toBe(
            /** @type {UnitView} */ (plot).getScaleResolution("color")
        );
        const rampData = getUnitData(ramp);
        const labelData = getUnitData(labels);

        expect(rampData.length).toBeGreaterThan(1);
        expect(rampData[0]).toEqual(
            expect.objectContaining({
                position0: 0,
                value: expect.any(Number),
            })
        );
        expect(rampData.at(-1)).toEqual(
            expect.objectContaining({
                position1: 1,
                value: expect.any(Number),
            })
        );
        expect(labelData.length).toBeGreaterThan(1);
        expect(
            labelData.every(({ position }) => position >= 0 && position <= 1)
        ).toBe(true);
        expect(labelData.every(({ label }) => typeof label == "string")).toBe(
            true
        );

        const context = new MarkRecordingRenderingContext({
            picking: false,
        });
        view.render(context, Rectangle.create(0, 0, 700, 300), {
            firstFacet: true,
        });
        expect(context.markNames).toEqual(
            expect.arrayContaining([
                "gradientRamp",
                "gradientTicks",
                "gradientLabels",
            ])
        );
    });

    test("formats gradient legend tick labels with the channel format", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, measurement: 0 },
                            { x: 2, y: 3, measurement: 1 },
                        ],
                    },
                    mark: "rect",
                    encoding: {
                        x: { field: "x", type: "index" },
                        y: { field: "y", type: "index" },
                        color: {
                            field: "measurement",
                            type: "quantitative",
                            format: ".1f",
                            scale: { domain: [0, 1] },
                        },
                    },
                },
            ],
        });
        const labelData = getLegendData(getLegends(view)[0], "gradientLabels");

        expect(labelData).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ value: 0, label: "0.0" }),
                expect.objectContaining({ value: 1, label: "1.0" }),
            ])
        );
    });

    test("creates gradient legends for quantitative fill and stroke", async () => {
        for (const channel of /** @type {const} */ (["fill", "stroke"])) {
            const view = await createLegendTestView({
                config: { legend: { disable: false } },
                vconcat: [
                    {
                        data: {
                            values: [
                                { x: 1, y: 1, measurement: 0 },
                                { x: 2, y: 2, measurement: 1 },
                            ],
                        },
                        mark: "point",
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            y: { field: "y", type: "quantitative" },
                            [channel]: {
                                field: "measurement",
                                type: "quantitative",
                            },
                        },
                    },
                ],
            });
            const legends = getLegends(view);
            const ramp = getLegendUnitChild(legends[0], "gradientRamp");
            const plot = view
                .getDescendants()
                .find((descendant) => descendant.name == "grid0");

            expect(legends).toHaveLength(1);
            expect(ramp).toBeInstanceOf(UnitView);
            expect(
                /** @type {UnitView} */ (ramp).getScaleResolution(channel)
            ).toBe(/** @type {UnitView} */ (plot).getScaleResolution(channel));
        }
    });

    test("lets stacked vertical gradient legends fill available height", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 1, measurement: 0 },
                            { x: 2, y: 2, measurement: 1 },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "measurement",
                            type: "quantitative",
                        },
                    },
                },
            ],
        });
        const legend = getLegends(view)[0];
        const body = getLegendChild(legend, "gradientBody");
        const region = getLegendRegions(view)[0];
        const legendHeight = legend.getSize().height;

        expect(legendHeight.grow).toBe(1);
        expect(legendHeight.minPx).toBeGreaterThan(body.getSize().height.minPx);
        expect(body.getSize().height).toEqual({ grow: 1, minPx: 40 });
        expect(region.getParallelSize()).toBeUndefined();

        const renderContext = new LegendRecordingRenderingContext({
            picking: false,
        });
        region.render(renderContext, Rectangle.create(0, 0, 120, 160));
        expect(renderContext.legendCoords.get(legend)?.height).toBe(160);
    });

    test("includes vertical gradient legend title in minimum height", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 1, measurement: 0 },
                            { x: 2, y: 2, measurement: 1 },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "measurement",
                            type: "quantitative",
                            legend: { title: "purifiedLogR" },
                        },
                    },
                },
            ],
        });
        const legend = getLegends(view)[0];
        const body = getLegendChild(legend, "gradientBody");

        expect(legend.getSize().height.minPx).toBeGreaterThan(
            body.getSize().height.minPx
        );
    });

    test("uses horizontal gradient legend minimum width", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 1, measurement: 0 },
                            { x: 2, y: 2, measurement: 1 },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "measurement",
                            type: "quantitative",
                            legend: {
                                orient: "bottom",
                                direction: "horizontal",
                            },
                        },
                    },
                },
            ],
        });
        const body = getLegendChild(getLegends(view)[0], "gradientBody");

        expect(body.getSize().width).toEqual({ grow: 1, minPx: 40 });
        expect(body.getSize().height).toEqual({ grow: 1 });
    });

    test("applies gradient geometry, appearance, and tick controls", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 1, measurement: 0 },
                            { x: 2, y: 2, measurement: 100 },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "measurement",
                            type: "quantitative",
                            scale: { domain: [0, 100] },
                            legend: {
                                gradientLength: 120,
                                gradientThickness: 18,
                                gradientOpacity: 0.4,
                                gradientStrokeColor: "#456",
                                gradientStrokeWidth: 2,
                                tickCount: 2,
                            },
                        },
                    },
                },
            ],
        });
        const legend = getLegends(view)[0];
        const body = getLegendChild(legend, "gradientBody");
        const ramp = getLegendUnitChild(legend, "gradientRamp");
        const border = getLegendUnitChild(legend, "gradientBorder");
        const labelData = getLegendData(legend, "gradientLabels");
        const borderData = getUnitData(border);

        // The body reserves half the centered border stroke on every edge.
        expect(body.getSize().height).toEqual({ px: 122, grow: 0 });
        expect(legend.getSize().height.grow).toBeUndefined();
        expect(legend.getPerpendicularSize()).toBeGreaterThanOrEqual(24);
        expect(ramp.mark.properties.opacity).toBe(0.4);
        expect(border.spec.mark).toEqual(
            expect.objectContaining({
                fillOpacity: 0,
                stroke: "#456",
                strokeWidth: 2,
            })
        );
        expect(borderData).toEqual([
            expect.objectContaining({
                position0: 0,
                position1: 1,
                _legendGradientBandStart: 0,
                _legendGradientBandStop: 18,
            }),
        ]);
        expect(labelData.map(({ value }) => value)).toEqual([0, 50, 100]);
    });

    test("gradient legends use source color scale and log tick positions", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 1, measurement: 1 },
                            { x: 2, y: 2, measurement: 100 },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "measurement",
                            type: "quantitative",
                            scale: {
                                type: "log",
                                domain: [1, 100],
                                scheme: "turbo",
                            },
                        },
                    },
                },
            ],
        });
        const legend = getLegends(view)[0];
        const ramp = getLegendUnitChild(legend, "gradientRamp");
        const labels = getLegendUnitChild(legend, "gradientLabels");
        const plot = view
            .getDescendants()
            .find((descendant) => descendant.name == "grid0");

        expect(ramp).toBeInstanceOf(UnitView);
        expect(labels).toBeInstanceOf(UnitView);
        expect(plot).toBeInstanceOf(UnitView);
        expect(/** @type {UnitView} */ (ramp).getScaleResolution("color")).toBe(
            /** @type {UnitView} */ (plot).getScaleResolution("color")
        );

        const labelData = getUnitData(labels);
        expect(labelData).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ value: 1, position: 0 }),
                expect.objectContaining({ value: 10, position: 0.5 }),
                expect.objectContaining({ value: 100, position: 1 }),
            ])
        );
    });

    test("gradient legends sample both sides of a domainMid scale", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 1, measurement: -5 },
                            { x: 2, y: 2, measurement: 10 },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "measurement",
                            type: "quantitative",
                            scale: {
                                scheme: "blueorange",
                                domainMid: 0,
                            },
                        },
                    },
                },
            ],
        });
        const rampData = getLegendData(getLegends(view)[0], "gradientRamp");
        const nearestMid = rampData.reduce((nearest, datum) =>
            Math.abs(datum.value) < Math.abs(nearest.value) ? datum : nearest
        );

        expect(Math.min(...rampData.map(({ value }) => value))).toBeLessThan(
            -4.5
        );
        expect(Math.max(...rampData.map(({ value }) => value))).toBeGreaterThan(
            9
        );
        expect(nearestMid.value).toBeCloseTo(0, 0);
        expect(nearestMid.position).toBeCloseTo(0.5, 1);
    });

    test("gradient legend positions follow continuous scale types", async () => {
        /** @type {Array<import("../../spec/scale.js").Scale & { domain: [number, number] }>} */
        const scales = [
            { type: "sqrt", domain: [0, 100] },
            { type: "pow", exponent: 3, domain: [0, 1000] },
            { type: "symlog", constant: 10, domain: [-100, 100] },
        ];

        for (const scale of scales) {
            const view = await createLegendTestView({
                config: { legend: { disable: false } },
                vconcat: [
                    {
                        data: {
                            values: [
                                {
                                    x: 1,
                                    y: 1,
                                    measurement: scale.domain[0],
                                },
                                {
                                    x: 2,
                                    y: 2,
                                    measurement: scale.domain[1],
                                },
                            ],
                        },
                        mark: "point",
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            y: { field: "y", type: "quantitative" },
                            color: {
                                field: "measurement",
                                type: "quantitative",
                                scale: {
                                    ...scale,
                                    scheme: "turbo",
                                },
                            },
                        },
                    },
                ],
            });
            const legend = getLegends(view)[0];
            const ramp = getLegendUnitChild(legend, "gradientRamp");
            const labels = getLegendUnitChild(legend, "gradientLabels");
            const expectedPosition = createScale({
                ...scale,
                range: [0, 1],
                zero: false,
                nice: false,
            });
            const rampData = getUnitData(ramp);
            const labelData = getUnitData(labels);

            for (const datum of [...rampData, ...labelData]) {
                expect(datum.position).toBeCloseTo(
                    expectedPosition(datum.value)
                );
            }
        }
    });

    test("threshold gradient legends include outer color buckets", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 1, measurement: 10 },
                            { x: 2, y: 2, measurement: 110 },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "measurement",
                            type: "quantitative",
                            scale: {
                                type: "threshold",
                                domain: [20, 40, 60, 80, 100],
                                scheme: "turbo",
                            },
                        },
                    },
                },
            ],
        });
        const legend = getLegends(view)[0];
        const ramp = getLegendUnitChild(legend, "gradientRamp");
        const labels = getLegendUnitChild(legend, "gradientLabels");

        expect(ramp).toBeInstanceOf(UnitView);
        expect(labels).toBeInstanceOf(UnitView);

        const rampData = getUnitData(ramp);
        const labelData = getUnitData(labels);

        expect(rampData).toHaveLength(6);
        expect(rampData[0].position0).toBe(0);
        expect(rampData[0].value).toBeLessThan(20);
        expect(rampData.at(-1).position1).toBe(1);
        expect(rampData.at(-1).value).toBeGreaterThan(100);
        expect(labelData[0]).toEqual(
            expect.objectContaining({
                value: 20,
                position: rampData[0].position1,
            })
        );
        expect(labelData.at(-1)).toEqual(
            expect.objectContaining({
                value: 100,
                position: rampData.at(-2).position1,
            })
        );
    });

    test("uses explicit legend values as gradient ticks", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 1, measurement: 0 },
                            { x: 2, y: 2, measurement: 100 },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "measurement",
                            type: "quantitative",
                            scale: { domain: [0, 100] },
                            legend: { values: [25, 75], tickCount: 1 },
                        },
                    },
                },
            ],
        });
        const labelData = getLegendData(getLegends(view)[0], "gradientLabels");

        expect(labelData.map(({ value }) => value)).toEqual([25, 75]);
    });

    test("quantize gradient legends use discrete color buckets", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 1, measurement: 0 },
                            { x: 2, y: 2, measurement: 100 },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "measurement",
                            type: "quantitative",
                            scale: {
                                type: "quantize",
                                domain: [0, 100],
                                scheme: { name: "viridis", count: 4 },
                            },
                        },
                    },
                },
            ],
        });
        const legend = getLegends(view)[0];
        const ramp = getLegendUnitChild(legend, "gradientRamp");
        const labels = getLegendUnitChild(legend, "gradientLabels");
        const rampData = getUnitData(ramp);
        const labelData = getUnitData(labels);

        expect(
            rampData.map(({ position0, position1 }) => [position0, position1])
        ).toEqual([
            [0, 0.25],
            [0.25, 0.5],
            [0.5, 0.75],
            [0.75, 1],
        ]);
        expect(labelData).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ value: 25, position: 0.25 }),
                expect.objectContaining({ value: 50, position: 0.5 }),
                expect.objectContaining({ value: 75, position: 0.75 }),
            ])
        );
    });
});
