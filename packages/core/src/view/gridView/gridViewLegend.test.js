import { describe, expect, test } from "vitest";

import ConcatView from "../concatView.js";
import LegendView from "../legendView.js";
import Rectangle from "../layout/rectangle.js";
import UnitView from "../unitView.js";
import ViewRenderingContext from "../renderingContext/viewRenderingContext.js";
import { createAndInitialize } from "../testUtils.js";
import { translateLegendCoords } from "./gridView.js";
import createScale from "../../scale/scale.js";

// Minimal context for layout-driven render calls without WebGL.
class NoOpRenderingContext extends ViewRenderingContext {
    /**
     * @param {import("../../types/rendering.js").GlobalRenderingOptions} options
     */
    constructor(options) {
        super(options);
    }

    pushView() {
        //
    }

    popView() {
        //
    }

    /**
     * @param {import("../../marks/mark.js").default} _mark
     */
    renderMark(_mark) {
        //
    }
}

class MarkRecordingRenderingContext extends NoOpRenderingContext {
    /** @type {string[]} */
    markNames = [];

    /**
     * @param {import("../../marks/mark.js").default} mark
     */
    renderMark(mark) {
        this.markNames.push(mark.unitView.name);
    }
}

describe("translateLegendCoords", () => {
    test("places a right-oriented legend next to the viewport", () => {
        const legendView = /** @type {any} */ ({
            getPerpendicularSize: () => 80,
            getExternalPadding: () => 12,
        });

        const coords = translateLegendCoords(
            Rectangle.create(10, 20, 300, 200),
            "right",
            legendView
        );

        expect(coords.x).toBe(322);
        expect(coords.y).toBe(20);
        expect(coords.width).toBe(80);
        expect(coords.height).toBe(200);
    });
});

describe("GridView legends", () => {
    const createLegendTestView = (
        /** @type {Partial<import("../../spec/root.js").RootSpec>} */ spec = {}
    ) =>
        createAndInitialize(
            /** @type {import("../../spec/root.js").RootSpec} */ ({
                vconcat: [
                    {
                        data: {
                            values: [
                                { x: 1, y: 2, Origin: "Europe" },
                                { x: 2, y: 3, Origin: "Japan" },
                            ],
                        },
                        mark: "point",
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            y: { field: "y", type: "quantitative" },
                            color: { field: "Origin", type: "nominal" },
                        },
                    },
                ],
                ...spec,
            }),
            ConcatView
        );

    const getLegends = (/** @type {ConcatView} */ view) =>
        view
            .getDescendants()
            .filter((descendant) => descendant instanceof LegendView);

    const getLegendTitle = (/** @type {LegendView} */ legend) =>
        legend
            .getDescendants()
            .find((descendant) => descendant.name == "title");

    test("keeps legends hidden by default", async () => {
        const view = await createLegendTestView();

        expect(getLegends(view)).toHaveLength(0);
    });

    test("creates an opt-in right legend for a nominal color scale", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
        });
        const legends = getLegends(view);
        const labels = legends[0]
            .getDescendants()
            .find((descendant) => descendant.name == "labels");

        expect(legends).toHaveLength(1);
        expect(legends[0].name).toBe("legend_right");
        expect(legends[0].legendProps.title).toBe("Origin");
        expect(labels).toBeInstanceOf(UnitView);
        expect(
            Array.from(labels.flowHandle.collector.getData()).map(
                ({ value, label, _legendIndex }) => ({
                    value,
                    label,
                    _legendIndex,
                })
            )
        ).toEqual([
            { value: "Europe", label: "Europe", _legendIndex: 0 },
            { value: "Japan", label: "Japan", _legendIndex: 1 },
        ]);
    });

    test("derives legend titles from legend, channel title, or field", async () => {
        const explicitLegendTitle = await createLegendTestView({
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, Origin: "Europe" },
                            { x: 2, y: 3, Origin: "Japan" },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "Origin",
                            type: "nominal",
                            title: "Channel title",
                            legend: { title: "Legend title" },
                        },
                    },
                },
            ],
        });
        expect(getLegends(explicitLegendTitle)[0].legendProps.title).toBe(
            "Legend title"
        );

        const channelTitle = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, Origin: "Europe" },
                            { x: 2, y: 3, Origin: "Japan" },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "Origin",
                            type: "nominal",
                            title: "Channel title",
                        },
                    },
                },
            ],
        });
        expect(getLegends(channelTitle)[0].legendProps.title).toBe(
            "Channel title"
        );

        const fieldTitle = await createLegendTestView({
            config: { legend: { disable: false } },
        });
        expect(getLegends(fieldTitle)[0].legendProps.title).toBe("Origin");
    });

    test("suppresses legend title with title null", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, Origin: "Europe" },
                            { x: 2, y: 3, Origin: "Japan" },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "Origin",
                            type: "nominal",
                            title: null,
                        },
                    },
                },
            ],
        });
        const legend = getLegends(view)[0];

        expect(legend.legendProps.title).toBeNull();
        expect(getLegendTitle(legend)).toBeUndefined();
    });

    test("formats symbol legend labels with the channel format", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, class: 0.125 },
                            { x: 2, y: 3, class: 0.5 },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "class",
                            type: "ordinal",
                            format: ".1f",
                        },
                    },
                },
            ],
        });
        const labels = getLegends(view)[0]
            .getDescendants()
            .find((descendant) => descendant.name == "labels");
        const labelData = Array.from(
            /** @type {UnitView} */ (labels).flowHandle.collector.getData()
        );

        expect(labelData.map(({ label }) => label)).toEqual(["0.1", "0.5"]);
    });

    test("passes legend title and label styling to generated marks", async () => {
        const view = await createLegendTestView({
            config: {
                legend: {
                    disable: false,
                    titleColor: "firebrick",
                    titleFont: "serif",
                    titleFontSize: 17,
                    titleFontStyle: "italic",
                    titleFontWeight: "bold",
                    titlePadding: 9,
                    labelColor: "navy",
                    labelFontSize: 13,
                    labelFontStyle: "italic",
                    labelFontWeight: "bold",
                    labelAlign: "right",
                    labelBaseline: "bottom",
                },
            },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, Origin: "Europe" },
                            { x: 2, y: 3, Origin: "Japan" },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "Origin",
                            type: "nominal",
                            legend: {
                                title: "Styled",
                            },
                        },
                    },
                },
            ],
        });
        const legend = getLegends(view)[0];
        const title = getLegendTitle(legend);
        const labels = legend
            .getDescendants()
            .find((descendant) => descendant.name == "labels");

        expect(title).toBeInstanceOf(UnitView);
        expect(/** @type {UnitView} */ (title).spec.height).toBe(26);
        expect(/** @type {UnitView} */ (title).spec.mark).toEqual(
            expect.objectContaining({
                color: "firebrick",
                font: "serif",
                fontStyle: "italic",
                fontWeight: "bold",
                size: 17,
                text: "Styled",
            })
        );
        expect(/** @type {UnitView} */ (labels).spec.mark).toEqual(
            expect.objectContaining({
                align: "right",
                baseline: "bottom",
                color: "navy",
                fontStyle: "italic",
                fontWeight: "bold",
                size: 13,
            })
        );
    });

    test("merges redundant color and shape channels into one symbol legend", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, Origin: "Europe" },
                            { x: 2, y: 3, Origin: "Japan" },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: { field: "Origin", type: "nominal" },
                        shape: { field: "Origin", type: "nominal" },
                    },
                },
            ],
        });
        const legends = getLegends(view);
        const symbols = legends[0]
            .getDescendants()
            .find((descendant) => descendant.name == "symbols");

        expect(legends).toHaveLength(1);
        expect(/** @type {UnitView} */ (symbols).spec.encoding).toEqual(
            expect.objectContaining({
                color: expect.objectContaining({ field: "value" }),
                shape: expect.objectContaining({ field: "value" }),
            })
        );
        expect(
            /** @type {UnitView} */ (symbols).spec.encoding
        ).not.toHaveProperty("stroke");
    });

    test("does not merge shape when its legend is null", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, Origin: "Europe" },
                            { x: 2, y: 3, Origin: "Japan" },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: { field: "Origin", type: "nominal" },
                        shape: {
                            field: "Origin",
                            type: "nominal",
                            legend: null,
                        },
                    },
                },
            ],
        });
        const legends = getLegends(view);
        const symbols = legends[0]
            .getDescendants()
            .find((descendant) => descendant.name == "symbols");

        expect(legends).toHaveLength(1);
        expect(
            /** @type {UnitView} */ (symbols).spec.encoding
        ).not.toHaveProperty("shape");
    });

    test("does not merge redundant-looking channels with different domains", async () => {
        await expect(
            createLegendTestView({
                config: { legend: { disable: false } },
                vconcat: [
                    {
                        data: {
                            values: [
                                { x: 1, y: 2, Origin: "Europe" },
                                { x: 2, y: 3, Origin: "Japan" },
                            ],
                        },
                        mark: "point",
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            y: { field: "y", type: "quantitative" },
                            color: { field: "Origin", type: "nominal" },
                            shape: {
                                field: "Origin",
                                type: "nominal",
                                scale: { domain: ["Japan", "Europe"] },
                            },
                        },
                    },
                ],
            })
        ).rejects.toThrow('A legend with the orient "right" already exists!');
    });

    test("creates a shape-only symbol legend", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, Origin: "Europe" },
                            { x: 2, y: 3, Origin: "Japan" },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        shape: { field: "Origin", type: "nominal" },
                    },
                },
            ],
        });
        const legends = getLegends(view);
        const symbols = legends[0]
            .getDescendants()
            .find((descendant) => descendant.name == "symbols");
        const labels = legends[0]
            .getDescendants()
            .find((descendant) => descendant.name == "labels");

        expect(legends).toHaveLength(1);
        expect(legends[0].legendProps.title).toBe("Origin");
        expect(symbols).toBeInstanceOf(UnitView);
        expect(labels).toBeInstanceOf(UnitView);
        expect(/** @type {UnitView} */ (symbols).spec.encoding).toEqual(
            expect.objectContaining({
                shape: expect.objectContaining({
                    field: "value",
                    type: "nominal",
                }),
            })
        );
    });

    test("creates readable fill and stroke symbol legends", async () => {
        const fillView = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, Origin: "Europe" },
                            { x: 2, y: 3, Origin: "Japan" },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        fill: { field: "Origin", type: "nominal" },
                    },
                },
            ],
        });
        const fillSymbols = getLegends(fillView)[0]
            .getDescendants()
            .find((descendant) => descendant.name == "symbols");

        expect(/** @type {UnitView} */ (fillSymbols).spec.mark).toEqual(
            expect.objectContaining({ filled: true })
        );
        expect(/** @type {UnitView} */ (fillSymbols).spec.encoding).toEqual(
            expect.objectContaining({
                fill: expect.objectContaining({ field: "value" }),
                stroke: { value: "#888" },
            })
        );

        const strokeView = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, Origin: "Europe" },
                            { x: 2, y: 3, Origin: "Japan" },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        stroke: { field: "Origin", type: "nominal" },
                    },
                },
            ],
        });
        const strokeSymbols = getLegends(strokeView)[0]
            .getDescendants()
            .find((descendant) => descendant.name == "symbols");

        expect(/** @type {UnitView} */ (strokeSymbols).spec.encoding).toEqual(
            expect.objectContaining({
                fill: { value: null },
                stroke: expect.objectContaining({ field: "value" }),
            })
        );
    });

    test("uses square symbols for rect mark color legends", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 0, x2: 1, y: "A", site: "Crookston" },
                            { x: 1, x2: 2, y: "A", site: "Duluth" },
                        ],
                    },
                    mark: "rect",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        x2: { field: "x2" },
                        y: { field: "y", type: "nominal" },
                        color: { field: "site", type: "nominal" },
                    },
                },
            ],
        });
        const symbols = getLegends(view)[0]
            .getDescendants()
            .find((descendant) => descendant.name == "symbols");

        expect(/** @type {UnitView} */ (symbols).spec.mark).toEqual(
            expect.objectContaining({ shape: "square" })
        );
    });

    test("creates an explicit channel legend even when defaults are disabled", async () => {
        const view = await createLegendTestView({
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, Origin: "Europe" },
                            { x: 2, y: 3, Origin: "Japan" },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "Origin",
                            type: "nominal",
                            legend: { title: "Region" },
                        },
                    },
                },
            ],
        });
        const legends = getLegends(view);

        expect(legends).toHaveLength(1);
        expect(legends[0].legendProps.title).toBe("Region");
    });

    test("respects explicit legend null", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, Origin: "Europe" },
                            { x: 2, y: 3, Origin: "Japan" },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "Origin",
                            type: "nominal",
                            legend: null,
                        },
                    },
                },
            ],
        });

        expect(getLegends(view)).toHaveLength(0);
    });

    test("does not create legends for positional quantitative channels", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: { values: [{ x: 1, y: 2 }] },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                    },
                },
            ],
        });

        expect(getLegends(view)).toHaveLength(0);
    });

    test("does not create accidental legends for deferred channels", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, SizeClass: "small" },
                            { x: 2, y: 3, SizeClass: "large" },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        opacity: { field: "SizeClass", type: "ordinal" },
                    },
                },
            ],
        });

        expect(getLegends(view)).toHaveLength(0);
    });

    test("creates a discrete size symbol legend", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, SizeClass: "small" },
                            { x: 2, y: 3, SizeClass: "large" },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        size: { field: "SizeClass", type: "ordinal" },
                    },
                },
            ],
        });
        const legends = getLegends(view);
        const symbols = legends[0]
            .getDescendants()
            .find((descendant) => descendant.name == "symbols");

        expect(legends).toHaveLength(1);
        expect(/** @type {UnitView} */ (symbols).spec.encoding).toEqual(
            expect.objectContaining({
                fill: { value: null },
                stroke: { value: "#888" },
                size: expect.objectContaining({
                    field: "value",
                    type: "ordinal",
                }),
            })
        );
    });

    test("creates a quantitative size symbol legend with representative values", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, population: 0 },
                            { x: 2, y: 3, population: 100 },
                        ],
                    },
                    mark: {
                        type: "point",
                        filled: true,
                        opacity: 0.7,
                        shape: "circle",
                    },
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        size: {
                            field: "population",
                            type: "quantitative",
                            format: ".1f",
                            scale: { domain: [0, 100] },
                        },
                        color: { value: "#000" },
                    },
                },
            ],
        });
        const legends = getLegends(view);
        const symbols = legends[0]
            .getDescendants()
            .find((descendant) => descendant.name == "symbols");
        const labels = legends[0]
            .getDescendants()
            .find((descendant) => descendant.name == "labels");
        const plot = view
            .getDescendants()
            .find((descendant) => descendant.name == "grid0");
        const labelData = Array.from(
            /** @type {UnitView} */ (labels).flowHandle.collector.getData()
        );

        expect(legends).toHaveLength(1);
        expect(/** @type {UnitView} */ (symbols).spec.encoding).toEqual(
            expect.objectContaining({
                fill: { value: "#000" },
                stroke: { value: null },
                strokeWidth: { value: 0 },
                size: expect.objectContaining({
                    field: "value",
                    type: "quantitative",
                }),
            })
        );
        expect(/** @type {UnitView} */ (symbols).spec.mark).toEqual(
            expect.objectContaining({
                filled: true,
                opacity: 0.7,
                shape: "circle",
            })
        );
        expect(
            /** @type {UnitView} */ (symbols).getScaleResolution("size")
        ).toBe(/** @type {UnitView} */ (plot).getScaleResolution("size"));
        expect(labelData).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    value: 0,
                    label: "0.0",
                    _legendSymbolSize: 0,
                }),
                expect.objectContaining({
                    value: 100,
                    label: "100.0",
                    _legendSymbolSize: 400,
                    _legendEntryHeight: 22,
                }),
            ])
        );
        expect(labelData.length).toBeGreaterThan(2);
    });

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
        const ramp = legends[0]
            .getDescendants()
            .find((descendant) => descendant.name == "gradientRamp");
        const labels = legends[0]
            .getDescendants()
            .find((descendant) => descendant.name == "gradientLabels");
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
        const rampData = Array.from(
            /** @type {UnitView} */ (ramp).flowHandle.collector.getData()
        );
        const labelData = Array.from(
            /** @type {UnitView} */ (labels).flowHandle.collector.getData()
        );

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

        const context = new MarkRecordingRenderingContext({ picking: false });
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
        const labels = getLegends(view)[0]
            .getDescendants()
            .find((descendant) => descendant.name == "gradientLabels");
        const labelData = Array.from(
            /** @type {UnitView} */ (labels).flowHandle.collector.getData()
        );

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
            const ramp = legends[0]
                .getDescendants()
                .find((descendant) => descendant.name == "gradientRamp");
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

    test("gradient legends mirror source scale type and color scheme", async () => {
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
        const ramp = legend
            .getDescendants()
            .find((descendant) => descendant.name == "gradientRamp");
        const labels = legend
            .getDescendants()
            .find((descendant) => descendant.name == "gradientLabels");
        const plot = view
            .getDescendants()
            .find((descendant) => descendant.name == "grid0");

        expect(ramp).toBeInstanceOf(UnitView);
        expect(labels).toBeInstanceOf(UnitView);
        expect(plot).toBeInstanceOf(UnitView);
        expect(/** @type {UnitView} */ (ramp).getScaleResolution("color")).toBe(
            /** @type {UnitView} */ (plot).getScaleResolution("color")
        );

        const labelData = Array.from(
            /** @type {UnitView} */ (labels).flowHandle.collector.getData()
        );
        expect(labelData).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ value: 1, position: 0 }),
                expect.objectContaining({ value: 10, position: 0.5 }),
                expect.objectContaining({ value: 100, position: 1 }),
            ])
        );
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
                                { x: 1, y: 1, measurement: scale.domain[0] },
                                { x: 2, y: 2, measurement: scale.domain[1] },
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
            const ramp = legend
                .getDescendants()
                .find((descendant) => descendant.name == "gradientRamp");
            const labels = legend
                .getDescendants()
                .find((descendant) => descendant.name == "gradientLabels");
            const expectedPosition = createScale({
                ...scale,
                range: [0, 1],
                zero: false,
                nice: false,
            });
            const rampData = Array.from(
                /** @type {UnitView} */ (ramp).flowHandle.collector.getData()
            );
            const labelData = Array.from(
                /** @type {UnitView} */ (labels).flowHandle.collector.getData()
            );

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
        const ramp = legend
            .getDescendants()
            .find((descendant) => descendant.name == "gradientRamp");
        const labels = legend
            .getDescendants()
            .find((descendant) => descendant.name == "gradientLabels");

        expect(ramp).toBeInstanceOf(UnitView);
        expect(labels).toBeInstanceOf(UnitView);

        const rampData = Array.from(
            /** @type {UnitView} */ (ramp).flowHandle.collector.getData()
        );
        const labelData = Array.from(
            /** @type {UnitView} */ (labels).flowHandle.collector.getData()
        );

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

    test("does not draw configured view strokes inside legends", async () => {
        const view = await createLegendTestView({
            config: {
                legend: { disable: false },
                view: { stroke: "lightgray" },
            },
        });
        const legends = getLegends(view);
        const legendBackgroundStrokes = legends[0]
            .getDescendants()
            .filter((descendant) =>
                descendant.name.startsWith("backgroundStroke")
            );

        expect(legends).toHaveLength(1);
        expect(legendBackgroundStrokes).toHaveLength(0);
    });
});
