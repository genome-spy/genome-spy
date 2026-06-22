import { describe, expect, test, vi } from "vitest";

import ConcatView from "../concatView.js";
import AxisGridView from "../axisGridView.js";
import LegendView, { LegendRegionView } from "../legendView.js";
import Rectangle from "../layout/rectangle.js";
import UnitView from "../unitView.js";
import ViewRenderingContext from "../renderingContext/viewRenderingContext.js";
import { createAndInitialize, createTestViewContext } from "../testUtils.js";
import { translateLegendCoords } from "./legendLayout.js";
import createScale from "../../scale/scale.js";
import {
    initializeViewSubtree,
    loadViewSubtreeData,
} from "../../data/flowInit.js";

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

describe("legend layout helpers", () => {
    describe("translateLegendCoords", () => {
        test("places a right-oriented legend next to the viewport", () => {
            const legendView = /** @type {any} */ ({
                getPerpendicularSize: () => 80,
                getOffset: () => 12,
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

        test("places a top-right legend inside the viewport", () => {
            const legendView = /** @type {any} */ ({
                getPerpendicularSize: () => 80,
                getOffset: () => 12,
            });

            const coords = translateLegendCoords(
                Rectangle.create(10, 20, 300, 200),
                "top-right",
                legendView
            );

            expect(coords.x).toBe(218);
            expect(coords.y).toBe(32);
            expect(coords.width).toBe(80);
            expect(coords.height).toBe(176);
        });

        test("places a bottom-right legend inside the viewport", () => {
            const legendView = /** @type {any} */ ({
                getPerpendicularSize: () => 80,
                getOffset: () => 12,
                getParallelSize: () => 60,
            });

            const coords = translateLegendCoords(
                Rectangle.create(10, 20, 300, 200),
                "bottom-right",
                legendView
            );

            expect(coords.x).toBe(218);
            expect(coords.y).toBe(148);
            expect(coords.width).toBe(80);
            expect(coords.height).toBe(60);
        });
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

    /**
     * Uses an explicit context so tests can model configured view visibility.
     *
     * @param {Partial<import("../../spec/root.js").RootSpec>} spec
     * @param {import("../../types/viewContext.js").default} context
     * @returns {Promise<ConcatView>}
     */
    const createLegendTestViewWithContext = async (spec, context) => {
        const view = await context.createOrImportView(
            /** @type {import("../../spec/root.js").RootSpec} */ (spec),
            null,
            null,
            "viewRoot"
        );
        if (!(view instanceof ConcatView)) {
            throw new Error("Expected a concat root view!");
        }

        view.visit((descendant) => {
            if (descendant instanceof UnitView) {
                descendant.mark.initializeEncoders();
            }
        });

        const { dataSources } = initializeViewSubtree(view, context.dataFlow);
        await loadViewSubtreeData(view, dataSources);

        return view;
    };

    const getLegends = (/** @type {ConcatView} */ view) =>
        view
            .getDescendants()
            .filter((descendant) => descendant instanceof LegendView);

    const getLegendRegions = (/** @type {ConcatView} */ view) =>
        view
            .getDescendants()
            .filter((descendant) => descendant instanceof LegendRegionView);

    const getLegendTitle = (/** @type {LegendView} */ legend) =>
        legend
            .getDescendants()
            .find((descendant) => descendant.name == "title");

    /**
     * @param {LegendView} legend
     * @param {string} name
     */
    const getLegendChild = (legend, name) => {
        const child = legend
            .getDescendants()
            .find((descendant) => descendant.name == name);
        if (!child) {
            throw new Error(`Legend child "${name}" not found!`);
        }

        return child;
    };

    /**
     * @param {LegendView} legend
     * @param {string} name
     */
    const getLegendUnitChild = (legend, name) => {
        const child = getLegendChild(legend, name);
        if (!(child instanceof UnitView)) {
            throw new Error(`Legend child "${name}" is not a UnitView!`);
        }

        return child;
    };

    /**
     * @param {UnitView} view
     */
    const getUnitData = (view) =>
        Array.from(view.flowHandle.collector.getData());

    /**
     * @param {LegendView} legend
     * @param {string} name
     */
    const getLegendData = (legend, name) =>
        getUnitData(getLegendUnitChild(legend, name));

    const getLegendTitles = (/** @type {ConcatView} */ view) =>
        getLegends(view).map((legend) => legend.legendProps.title);

    /**
     * @param {number} [height]
     * @returns {import("../../spec/view.js").UnitSpec}
     */
    const createIndexColorPlotSpec = (height) => ({
        ...(height === undefined ? {} : { height }),
        data: {
            values: [
                { x: 1, y: 2, Origin: "Europe" },
                { x: 2, y: 3, Origin: "Japan" },
            ],
        },
        mark: "point",
        encoding: {
            x: { field: "x", type: "index" },
            y: { field: "y", type: "quantitative" },
            color: { field: "Origin", type: "nominal" },
        },
    });

    describe("basic creation", () => {
        test("creates legends by default", async () => {
            const view = await createLegendTestView();

            expect(getLegends(view)).toHaveLength(1);
        });

        test("creates a right legend for a nominal color scale", async () => {
            const view = await createLegendTestView();
            const legends = getLegends(view);

            expect(legends).toHaveLength(1);
            expect(legends[0].name).toBe("legend_right");
            expect(legends[0].legendProps.title).toBe("Origin");
            expect(
                getLegendData(legends[0], "labels").map(({ value, label }) => ({
                    value,
                    label,
                }))
            ).toEqual([
                { value: "Europe", label: "Europe" },
                { value: "Japan", label: "Japan" },
            ]);
        });

        test("does not create a legend for a disabled scale", async () => {
            const view = await createAndInitialize(
                /** @type {import("../../spec/root.js").RootSpec} */ ({
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
                                size: {
                                    field: "y",
                                    type: "quantitative",
                                    scale: null,
                                },
                            },
                        },
                    ],
                }),
                ConcatView
            );

            expect(getLegends(view)).toHaveLength(0);
        });

        test("collects a shared hconcat legend into one region", async () => {
            const view = await createAndInitialize(
                /** @type {import("../../spec/root.js").RootSpec} */ ({
                    config: { legend: { disable: false } },
                    resolve: {
                        scale: { color: "shared" },
                        legend: { color: "shared" },
                    },
                    hconcat: [
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
                                    legend: { orient: "right" },
                                },
                            },
                        },
                        {
                            data: {
                                values: [
                                    { x: 3, y: 4, group: "alpha" },
                                    { x: 4, y: 5, group: "gamma" },
                                ],
                            },
                            mark: "point",
                            encoding: {
                                x: { field: "x", type: "quantitative" },
                                y: { field: "y", type: "quantitative" },
                                color: {
                                    field: "group",
                                    type: "nominal",
                                    legend: { orient: "right" },
                                },
                            },
                        },
                    ],
                }),
                ConcatView
            );

            expect(getLegends(view)).toHaveLength(1);
            expect(getLegendRegions(view)).toHaveLength(1);

            const renderContext = new MarkRecordingRenderingContext({
                picking: false,
            });
            view.render(renderContext, Rectangle.create(0, 0, 700, 300), {
                firstFacet: true,
            });
            expect(renderContext.markNames).toEqual(
                expect.arrayContaining(["symbols", "labels"])
            );
        });

        test("uses scale resolution when legend resolution is omitted", async () => {
            const view = await createAndInitialize(
                /** @type {import("../../spec/root.js").RootSpec} */ ({
                    config: { legend: { disable: false } },
                    resolve: {
                        scale: { color: "independent" },
                    },
                    hconcat: [
                        {
                            data: {
                                values: [{ x: 1, y: 2, group: "alpha" }],
                            },
                            mark: "point",
                            encoding: {
                                x: { field: "x", type: "quantitative" },
                                y: { field: "y", type: "quantitative" },
                                color: {
                                    field: "group",
                                    type: "nominal",
                                    legend: { orient: "right" },
                                },
                            },
                        },
                        {
                            data: {
                                values: [{ x: 3, y: 4, group: "beta" }],
                            },
                            mark: "point",
                            encoding: {
                                x: { field: "x", type: "quantitative" },
                                y: { field: "y", type: "quantitative" },
                                color: {
                                    field: "group",
                                    type: "nominal",
                                    legend: { orient: "right" },
                                },
                            },
                        },
                    ],
                }),
                ConcatView
            );

            expect(getLegends(view)).toHaveLength(2);
            expect(getLegendRegions(view)).toHaveLength(2);
        });

        test("keeps independent layer scale legends separate", async () => {
            const view = await createAndInitialize(
                /** @type {import("../../spec/root.js").RootSpec} */ ({
                    config: { legend: { disable: false } },
                    data: {
                        values: [
                            {
                                x: 1,
                                y: 2,
                                group: "alpha",
                                amount: 3,
                                intensity: 4,
                            },
                        ],
                    },
                    vconcat: [
                        {
                            resolve: {
                                scale: { color: "independent" },
                            },
                            layer: [
                                {
                                    mark: "point",
                                    encoding: {
                                        x: {
                                            field: "x",
                                            type: "quantitative",
                                        },
                                        y: {
                                            field: "y",
                                            type: "quantitative",
                                        },
                                        color: {
                                            field: "group",
                                            type: "nominal",
                                            legend: { orient: "right" },
                                        },
                                    },
                                },
                                {
                                    mark: "point",
                                    encoding: {
                                        x: {
                                            field: "x",
                                            type: "quantitative",
                                        },
                                        y: {
                                            field: "y",
                                            type: "quantitative",
                                        },
                                        size: {
                                            field: "amount",
                                            type: "quantitative",
                                            legend: { orient: "right" },
                                        },
                                    },
                                },
                                {
                                    mark: "point",
                                    encoding: {
                                        x: {
                                            field: "x",
                                            type: "quantitative",
                                        },
                                        y: {
                                            field: "y",
                                            type: "quantitative",
                                        },
                                        color: {
                                            field: "intensity",
                                            type: "quantitative",
                                            legend: { orient: "right" },
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                }),
                ConcatView
            );

            expect(getLegendTitles(view)).toEqual([
                "group",
                "amount",
                "intensity",
            ]);
        });

        test("orders stacked legends by source view before displayed title", async () => {
            const view = await createLegendTestView({
                config: { legend: { disable: false } },
                vconcat: [
                    {
                        data: {
                            values: [
                                {
                                    x: 1,
                                    y: 2,
                                    group: "alpha",
                                    amount: 10,
                                    group2: "beta",
                                    amount2: 20,
                                },
                            ],
                        },
                        resolve: {
                            scale: {
                                color: "independent",
                                size: "independent",
                            },
                        },
                        layer: [
                            {
                                mark: "point",
                                encoding: {
                                    x: {
                                        field: "x",
                                        type: "quantitative",
                                    },
                                    y: {
                                        field: "y",
                                        type: "quantitative",
                                    },
                                    color: {
                                        field: "group",
                                        type: "nominal",
                                        legend: { title: "Zeta" },
                                    },
                                    size: {
                                        field: "amount",
                                        type: "quantitative",
                                        scale: { domain: [0, 30] },
                                        legend: { title: "Alpha" },
                                    },
                                },
                            },
                            {
                                mark: "point",
                                encoding: {
                                    x: {
                                        field: "x",
                                        type: "quantitative",
                                    },
                                    y: {
                                        field: "y",
                                        type: "quantitative",
                                    },
                                    color: {
                                        field: "group2",
                                        type: "nominal",
                                        legend: { title: "Beta" },
                                    },
                                    size: {
                                        field: "amount2",
                                        type: "quantitative",
                                        scale: { domain: [0, 30] },
                                        legend: { title: "Aardvark" },
                                    },
                                },
                            },
                        ],
                    },
                ],
            });

            expect(getLegendTitles(view)).toEqual([
                "Alpha",
                "Zeta",
                "Aardvark",
                "Beta",
            ]);
        });

        test("hides a stacked legend when its contributing view is hidden", async () => {
            let sizeLayerVisible = true;
            const context = createTestViewContext();
            context.isViewConfiguredVisible = (view) =>
                view.spec.name !== "size-layer" || sizeLayerVisible;
            const view = await createLegendTestViewWithContext(
                {
                    config: { legend: { disable: false } },
                    vconcat: [
                        {
                            layer: [
                                {
                                    name: "color-layer",
                                    data: {
                                        values: [
                                            {
                                                x: 1,
                                                y: 2,
                                                group: "alpha",
                                            },
                                            {
                                                x: 2,
                                                y: 3,
                                                group: "beta",
                                            },
                                        ],
                                    },
                                    mark: "point",
                                    encoding: {
                                        x: {
                                            field: "x",
                                            type: "quantitative",
                                        },
                                        y: {
                                            field: "y",
                                            type: "quantitative",
                                        },
                                        color: {
                                            field: "group",
                                            type: "nominal",
                                            legend: { orient: "right" },
                                        },
                                    },
                                },
                                {
                                    name: "size-layer",
                                    data: {
                                        values: [
                                            { x: 1, y: 2, amount: 1 },
                                            { x: 2, y: 3, amount: 2 },
                                        ],
                                    },
                                    mark: "point",
                                    encoding: {
                                        x: {
                                            field: "x",
                                            type: "quantitative",
                                        },
                                        y: {
                                            field: "y",
                                            type: "quantitative",
                                        },
                                        size: {
                                            field: "amount",
                                            type: "quantitative",
                                            legend: { orient: "right" },
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
                context
            );
            const legendRegion = getLegendRegions(view)[0];
            const renderContext = new MarkRecordingRenderingContext({
                picking: false,
            });

            legendRegion.render(
                renderContext,
                Rectangle.create(0, 0, 120, 160)
            );
            expect(
                renderContext.markNames.filter((name) => name === "symbols")
            ).toHaveLength(2);

            sizeLayerVisible = false;
            renderContext.markNames = [];
            legendRegion.render(
                renderContext,
                Rectangle.create(0, 0, 120, 160)
            );

            expect(renderContext.markNames).toContain("symbols");
            expect(
                renderContext.markNames.filter((name) => name === "symbols")
            ).toHaveLength(1);
        });

        test("does not inherit axis grids into generated legend views", async () => {
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
                            x: {
                                field: "x",
                                type: "quantitative",
                                axis: { grid: true },
                            },
                            y: { field: "y", type: "quantitative" },
                            color: {
                                field: "Origin",
                                type: "nominal",
                            },
                        },
                    },
                ],
            });

            const legend = getLegends(view)[0];
            const legendAxisGrids = legend
                .getDescendants()
                .filter((descendant) => descendant instanceof AxisGridView);

            expect(legendAxisGrids).toHaveLength(0);
        });

        test("does not inherit plot position encodings into legend title", async () => {
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
                                legend: { title: "Origin" },
                            },
                        },
                    },
                ],
            });

            const title = getLegendTitle(getLegends(view)[0]);

            expect(title.getEncoding()).toEqual({
                text: { field: "label" },
            });
        });

        test("evaluates legend orient ExprRef when legends are created", async () => {
            const view = await createLegendTestView({
                params: [{ name: "legendSide", value: "bottom" }],
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
                                legend: { orient: { expr: "legendSide" } },
                            },
                        },
                    },
                ],
            });
            const [legend] = getLegends(view);
            const [region] = getLegendRegions(view);

            expect(legend.legendProps.orient).toBe("bottom");
            expect(legend.name).toBe("legend_bottom");
            expect(region.name).toBe("legend_region_bottom");
        });

        test("rejects reactive changes to legend orient ExprRefs", async () => {
            const view = await createLegendTestView({
                params: [{ name: "legendSide", value: "right" }],
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
                                legend: { orient: { expr: "legendSide" } },
                            },
                        },
                    },
                ],
            });

            expect(() =>
                view.paramRuntime.setValue("legendSide", "bottom")
            ).toThrow("Reactive legend orient changes are not supported");
        });

        test("uses track legend defaults for index views", async () => {
            const view = await createLegendTestView({
                vconcat: [createIndexColorPlotSpec(40)],
            });
            const [legend] = getLegends(view);

            expect(legend.legendProps.orient).toBe("bottom");
            expect(legend.legendProps.titleOrient).toBe("left");
            expect(legend.legendProps.spacing).toBe(3);
            expect(legend.legendProps.offset).toBe(3);
        });

        test("uses track legend defaults for locus views before assembly preflight", async () => {
            const context = createTestViewContext();
            context.genomeStore.configureGenomes(
                new Map([
                    ["hg38_chr1-22", { url: "data/tools/hg38_chr1_22.sizes" }],
                ]),
                "hg38_chr1-22"
            );

            // View construction happens before URL-backed assemblies are loaded.
            const view = await context.createOrImportView(
                /** @type {import("../../spec/root.js").RootSpec} */ ({
                    vconcat: [
                        {
                            height: 40,
                            data: {
                                values: [
                                    {
                                        chrom: "chr1",
                                        start: 1,
                                        Origin: "Europe",
                                    },
                                    {
                                        chrom: "chr2",
                                        start: 2,
                                        Origin: "Japan",
                                    },
                                ],
                            },
                            mark: "point",
                            encoding: {
                                x: {
                                    chrom: "chrom",
                                    pos: "start",
                                    type: "locus",
                                },
                                color: {
                                    field: "Origin",
                                    type: "nominal",
                                },
                            },
                        },
                    ],
                }),
                null,
                null,
                "viewRoot"
            );
            if (!(view instanceof ConcatView)) {
                throw new Error("Expected a concat root view!");
            }
            const [legend] = getLegends(view);

            expect(legend.legendProps.orient).toBe("bottom");
            expect(legend.legendProps.titleOrient).toBe("left");
        });

        test("uses track defaults for layer children with index x scale", async () => {
            const view = await createLegendTestView({
                vconcat: [
                    {
                        height: 40,
                        data: {
                            values: [
                                { x: 1, y: 2, Origin: "Europe" },
                                { x: 2, y: 3, Origin: "Japan" },
                            ],
                        },
                        encoding: {
                            x: { field: "x", type: "index" },
                            y: { field: "y", type: "quantitative" },
                        },
                        layer: [
                            {
                                mark: "point",
                                encoding: {
                                    color: {
                                        field: "Origin",
                                        type: "nominal",
                                    },
                                },
                            },
                        ],
                    },
                ],
            });
            const [legend] = getLegends(view);

            expect(legend.legendProps.orient).toBe("bottom");
            expect(legend.legendProps.titleOrient).toBe("left");
        });

        test("lets global legend config override track defaults", async () => {
            const view = await createLegendTestView({
                config: {
                    legend: {
                        orient: "left",
                        titleOrient: "top",
                    },
                },
                vconcat: [createIndexColorPlotSpec(40)],
            });
            const [legend] = getLegends(view);

            expect(legend.legendProps.orient).toBe("left");
            expect(legend.legendProps.titleOrient).toBe("top");
        });

        test("uses track defaults for growing index views", async () => {
            const view = await createLegendTestView({
                vconcat: [createIndexColorPlotSpec()],
            });
            const [legend] = getLegends(view);

            expect(legend.legendProps.orient).toBe("bottom");
            expect(legend.legendProps.titleOrient).toBe("left");
        });

        test("creates legends for layer children", async () => {
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
                                        legend: { title: "Difference" },
                                    },
                                },
                            },
                        ],
                    },
                ],
            });

            expect(getLegendTitles(view)).toEqual(["Group", "Difference"]);
            expect(getLegendRegions(view)).toHaveLength(1);
        });

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

        test("includes stack spacing in top and bottom legend overhang", async () => {
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
            const legendHeights = getLegends(view).map((legend) =>
                legend.getPerpendicularSize()
            );

            expect(region.getPerpendicularSize()).toBe(
                legendHeights.reduce((sum, height) => sum + height, 0) + 10
            );
        });
    });

    describe("titles and labels", () => {
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
            const labelData = getLegendData(getLegends(view)[0], "labels");

            expect(labelData.map(({ label }) => label)).toEqual(["0.1", "0.5"]);
        });

        test("passes legend title and label styling to generated marks", async () => {
            const view = await createLegendTestView({
                config: {
                    legend: {
                        disable: false,
                        titleColor: "firebrick",
                        titleFontSize: 17,
                        titlePadding: 9,
                        labelColor: "navy",
                        labelFontSize: 13,
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
            const labels = getLegendUnitChild(legend, "labels");

            expect(title).toBeInstanceOf(UnitView);
            expect(/** @type {UnitView} */ (title).spec.height).toBe(26);
            expect(/** @type {UnitView} */ (title).spec.mark).toEqual(
                expect.objectContaining({
                    color: "firebrick",
                    size: 17,
                })
            );
            expect(/** @type {UnitView} */ (labels).spec.mark).toEqual(
                expect.objectContaining({
                    color: "navy",
                    size: 13,
                })
            );
        });

        test("places legend titles according to titleOrient", async () => {
            const getLegendRootSpec = async (
                /** @type {import("../../spec/legend.js").LegendTitleOrient} */ titleOrient
            ) => {
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
                                    legend: { title: "Origin", titleOrient },
                                },
                            },
                        },
                    ],
                });

                return /** @type {any} */ (getLegends(view)[0].spec);
            };
            const getRootChildNames = (/** @type {any} */ childSpec) =>
                /** @type {import("../../spec/view.js").ViewSpec[]} */ (
                    childSpec.vconcat ?? childSpec.hconcat
                ).map(
                    (
                        /** @type {import("../../spec/view.js").ViewSpec} */ spec
                    ) => spec.name
                );

            expect(getRootChildNames(await getLegendRootSpec("top"))).toEqual([
                "title",
                "legendBody",
            ]);
            expect(
                getRootChildNames(await getLegendRootSpec("bottom"))
            ).toEqual(["legendBody", "title"]);
            const leftSpec = await getLegendRootSpec("left");
            expect(getRootChildNames(leftSpec)).toEqual([
                "title",
                "legendBody",
            ]);
            expect(getRootChildNames(await getLegendRootSpec("right"))).toEqual(
                ["legendBody", "title"]
            );
        });

        test("keeps horizontal symbol legend extent data-driven", async () => {
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
                                legend: {
                                    orient: "bottom",
                                    title: "Origin",
                                    titleOrient: "left",
                                },
                            },
                        },
                    },
                ],
            });
            const legend = getLegends(view)[0];
            await Promise.resolve();

            expect(legend.getPerpendicularSize()).toBeLessThan(32);
        });

        test("applies configured title and label text limits", async () => {
            const view = await createLegendTestView({
                config: {
                    legend: {
                        disable: false,
                        titleLimit: 0,
                        labelLimit: 0,
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
                                    title: "Long title",
                                },
                            },
                        },
                    },
                ],
            });
            const legend = getLegends(view)[0];

            expect(
                getLegendData(legend, "title").map(({ label }) => label)
            ).toEqual([""]);
            expect(
                getLegendData(legend, "labels").map(({ label }) => label)
            ).toEqual(["", ""]);
        });
    });

    describe("symbol legends", () => {
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
            const symbols = getLegendUnitChild(legends[0], "symbols");

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
            const symbols = getLegendUnitChild(legends[0], "symbols");

            expect(legends).toHaveLength(1);
            expect(
                /** @type {UnitView} */ (symbols).spec.encoding
            ).not.toHaveProperty("shape");
        });

        test("keeps non-redundant same-orient legends separate", async () => {
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
                                scale: { domain: ["Japan", "Europe"] },
                            },
                        },
                    },
                ],
            });
            const legends = getLegends(view);

            expect(legends).toHaveLength(2);
            expect(legends.map((legend) => legend.legendProps.title)).toEqual([
                "Origin",
                "Origin",
            ]);
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
            const symbols = getLegendUnitChild(legends[0], "symbols");
            const labels = getLegendUnitChild(legends[0], "labels");

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
            const fillSymbols = getLegendUnitChild(
                getLegends(fillView)[0],
                "symbols"
            );

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
            const strokeSymbols = getLegendUnitChild(
                getLegends(strokeView)[0],
                "symbols"
            );

            expect(
                /** @type {UnitView} */ (strokeSymbols).spec.encoding
            ).toEqual(
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
            const symbols = getLegendUnitChild(getLegends(view)[0], "symbols");

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

        test("uses reactive disable as legend visibility predicate", async () => {
            const view = await createLegendTestView({
                params: [{ name: "showLegends", value: true }],
                config: {
                    legend: {
                        disable: { expr: "!showLegends" },
                    },
                },
            });
            const legends = getLegends(view);
            const regions = getLegendRegions(view);
            view.context.requestLayoutReflow = vi.fn();
            view.context.animator.requestRender = vi.fn();

            expect(legends).toHaveLength(1);
            expect(regions).toHaveLength(1);
            expect(legends[0].isConfiguredVisible()).toBe(true);
            expect(legends[0].isActive()).toBe(true);
            expect(regions[0].getParallelSize()).toBeGreaterThan(0);

            view.paramRuntime.setValue("showLegends", false);
            await view.paramRuntime.whenPropagated();

            expect(legends[0].isConfiguredVisible()).toBe(true);
            expect(legends[0].isActive()).toBe(false);
            expect(regions[0].getParallelSize()).toBe(0);

            view.paramRuntime.setValue("showLegends", true);
            await view.paramRuntime.whenPropagated();

            expect(legends[0].isActive()).toBe(true);
            expect(regions[0].getParallelSize()).toBeGreaterThan(0);
            expect(view.context.requestLayoutReflow).toHaveBeenCalled();
            expect(view.context.animator.requestRender).toHaveBeenCalled();
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

        test("uses explicit legend values as an ordered symbol subset", async () => {
            const view = await createLegendTestView({
                config: { legend: { disable: false } },
                vconcat: [
                    {
                        data: {
                            values: [
                                { x: 1, y: 2, Origin: "USA" },
                                { x: 2, y: 3, Origin: "Europe" },
                                { x: 3, y: 4, Origin: "Japan" },
                            ],
                        },
                        mark: "point",
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            y: { field: "y", type: "quantitative" },
                            color: {
                                field: "Origin",
                                type: "nominal",
                                legend: { values: ["Japan", "USA"] },
                            },
                        },
                    },
                ],
            });
            const labelData = getLegendData(getLegends(view)[0], "labels");

            expect(labelData.map(({ value }) => value)).toEqual([
                "Japan",
                "USA",
            ]);
        });

        test("uses explicit column count for symbol legend packing", async () => {
            const view = await createLegendTestView({
                config: { legend: { disable: false } },
                vconcat: [
                    {
                        data: {
                            values: [
                                { x: 1, y: 2, Origin: "A" },
                                { x: 2, y: 3, Origin: "B" },
                                { x: 3, y: 4, Origin: "C" },
                                { x: 4, y: 5, Origin: "D" },
                                { x: 5, y: 6, Origin: "E" },
                            ],
                        },
                        mark: "point",
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            y: { field: "y", type: "quantitative" },
                            color: {
                                field: "Origin",
                                type: "nominal",
                                legend: { columns: 2 },
                            },
                        },
                    },
                ],
            });
            const labelData = getLegendData(getLegends(view)[0], "labels");

            expect(labelData.map(({ column }) => column)).toEqual([
                0, 0, 0, 1, 1,
            ]);
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

        test("does not create legends for unsupported scale-backed channels", async () => {
            for (const channel of /** @type {const} */ ([
                "strokeWidth",
                "angle",
            ])) {
                const view = await createLegendTestView({
                    config: { legend: { disable: false } },
                    vconcat: [
                        {
                            data: {
                                values: [
                                    { x: 1, y: 2, measurement: 1 },
                                    { x: 2, y: 3, measurement: 2 },
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

                expect(getLegends(view)).toHaveLength(0);
            }
        });

        test("creates symbol legends for opacity-like channels", async () => {
            for (const channel of /** @type {const} */ ([
                "opacity",
                "fillOpacity",
                "strokeOpacity",
            ])) {
                const view = await createLegendTestView({
                    config: { legend: { disable: false } },
                    vconcat: [
                        {
                            data: {
                                values: [
                                    { x: 1, y: 2, group: "low" },
                                    { x: 2, y: 3, group: "high" },
                                ],
                            },
                            mark: { type: "point", filled: true },
                            encoding: {
                                x: { field: "x", type: "quantitative" },
                                y: { field: "y", type: "quantitative" },
                                [channel]: {
                                    field: "group",
                                    type: "ordinal",
                                },
                            },
                        },
                    ],
                });
                const legends = getLegends(view);
                const symbols = getLegendUnitChild(legends[0], "symbols");

                expect(legends).toHaveLength(1);
                expect(/** @type {UnitView} */ (symbols).spec.encoding).toEqual(
                    expect.objectContaining({
                        [channel]: expect.objectContaining({
                            field: "value",
                            type: "ordinal",
                        }),
                    })
                );
            }
        });

        test("creates quantitative opacity legends with representative values", async () => {
            const view = await createLegendTestView({
                config: { legend: { disable: false } },
                vconcat: [
                    {
                        data: {
                            values: [
                                { x: 1, y: 2, confidence: 0 },
                                { x: 2, y: 3, confidence: 1 },
                            ],
                        },
                        mark: "point",
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            y: { field: "y", type: "quantitative" },
                            opacity: {
                                field: "confidence",
                                type: "quantitative",
                                scale: { domain: [0, 1] },
                            },
                        },
                    },
                ],
            });
            const labels = getLegendUnitChild(getLegends(view)[0], "labels");
            const labelData = getUnitData(labels);

            expect(labelData).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ value: 0, label: "0.0" }),
                    expect.objectContaining({ value: 1, label: "1.0" }),
                ])
            );
            expect(labelData.length).toBeGreaterThan(2);
        });

        test("uses constant mark color for opacity legends", async () => {
            const view = await createLegendTestView({
                config: { legend: { disable: false } },
                vconcat: [
                    {
                        data: {
                            values: [
                                { x: 1, y: 2, confidence: 0 },
                                { x: 2, y: 3, confidence: 1 },
                            ],
                        },
                        mark: {
                            type: "point",
                            filled: true,
                            color: "red",
                        },
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            y: { field: "y", type: "quantitative" },
                            opacity: {
                                field: "confidence",
                                type: "quantitative",
                                scale: { domain: [0, 1] },
                            },
                        },
                    },
                ],
            });
            const symbols = getLegendUnitChild(getLegends(view)[0], "symbols");

            expect(/** @type {UnitView} */ (symbols).spec.encoding).toEqual(
                expect.objectContaining({
                    fill: { value: "red" },
                    stroke: { value: null },
                    strokeWidth: { value: 0 },
                    opacity: expect.objectContaining({
                        field: "value",
                        type: "quantitative",
                    }),
                })
            );
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
            const symbols = getLegendUnitChild(legends[0], "symbols");

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

        test("uses source scales without contributing legend entries to their domains", async () => {
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
                        },
                    },
                ],
            });
            const legend = getLegends(view)[0];
            const symbols = getLegendUnitChild(legend, "symbols");
            const plot = view
                .getDescendants()
                .find((descendant) => descendant.name == "grid0");
            const symbolEncoding = /** @type {UnitView} */ (symbols).spec
                .encoding.color;

            expect(
                /** @type {UnitView} */ (symbols).getScaleResolution("color")
            ).toBe(/** @type {UnitView} */ (plot).getScaleResolution("color"));
            expect(symbolEncoding).toEqual(
                expect.objectContaining({ domainInert: true })
            );
        });

        test("uses neutral symbols for size legends with separate color scales", async () => {
            const view = await createLegendTestView({
                config: { legend: { disable: false } },
                vconcat: [
                    {
                        data: {
                            values: [
                                {
                                    x: 1,
                                    y: 2,
                                    population: 0,
                                    Origin: "Europe",
                                },
                                {
                                    x: 2,
                                    y: 3,
                                    population: 100,
                                    Origin: "Japan",
                                },
                            ],
                        },
                        mark: {
                            type: "point",
                            filled: true,
                            opacity: 0.7,
                        },
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            y: { field: "y", type: "quantitative" },
                            size: {
                                field: "population",
                                type: "quantitative",
                                scale: { domain: [0, 100] },
                            },
                            color: {
                                field: "Origin",
                                type: "nominal",
                                legend: null,
                            },
                        },
                    },
                ],
            });
            const symbols = getLegendUnitChild(getLegends(view)[0], "symbols");

            expect(/** @type {UnitView} */ (symbols).spec.encoding).toEqual(
                expect.objectContaining({
                    fill: { value: "black" },
                    size: expect.objectContaining({
                        field: "value",
                        type: "quantitative",
                    }),
                })
            );
            expect(/** @type {UnitView} */ (symbols).spec.mark).toEqual(
                expect.objectContaining({ opacity: 0.7 })
            );
            expect(
                /** @type {UnitView} */ (symbols).spec.encoding.color
            ).toBeUndefined();
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
            const symbols = getLegendUnitChild(legends[0], "symbols");
            const labels = getLegendUnitChild(legends[0], "labels");
            const plot = view
                .getDescendants()
                .find((descendant) => descendant.name == "grid0");
            const labelData = getUnitData(labels);

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
                    }),
                ])
            );
            expect(labelData.length).toBeGreaterThan(2);
        });

        test("uses stroke-width symbols for rule size legends", async () => {
            const view = await createLegendTestView({
                config: { legend: { disable: false } },
                vconcat: [
                    {
                        data: {
                            values: [
                                { x: 0, x2: 1, y: 2, width: 1 },
                                { x: 1, x2: 2, y: 3, width: 6 },
                            ],
                        },
                        mark: { type: "rule", color: "red" },
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            x2: { field: "x2", type: "quantitative" },
                            y: { field: "y", type: "quantitative" },
                            size: {
                                field: "width",
                                type: "quantitative",
                                scale: { domain: [0, 6], range: [1, 6] },
                            },
                        },
                    },
                ],
            });
            const legend = getLegends(view)[0];
            const symbols = getLegendUnitChild(legend, "symbols");
            const labels = getLegendUnitChild(legend, "labels");
            const plot = view
                .getDescendants()
                .find((descendant) => descendant.name == "grid0");
            const labelData = getUnitData(labels);

            expect(/** @type {UnitView} */ (symbols).spec.mark).toEqual(
                expect.objectContaining({ type: "rule" })
            );
            expect(/** @type {UnitView} */ (symbols).spec.encoding).toEqual(
                expect.objectContaining({
                    x: expect.objectContaining({ field: "symbolX" }),
                    x2: expect.objectContaining({ field: "symbolX2" }),
                    color: { value: "red" },
                    size: expect.objectContaining({
                        field: "value",
                        type: "quantitative",
                    }),
                })
            );
            expect(
                /** @type {UnitView} */ (symbols).getScaleResolution("size")
            ).toBe(/** @type {UnitView} */ (plot).getScaleResolution("size"));
            expect(labelData).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        value: 6,
                        _legendStrokeWidth: 6,
                    }),
                ])
            );
        });

        test("uses stroke-width symbols for link size legends", async () => {
            const view = await createLegendTestView({
                config: { legend: { disable: false } },
                vconcat: [
                    {
                        data: {
                            values: [
                                { x: 0, x2: 1, y: 2, y2: 3, width: 1 },
                                { x: 1, x2: 2, y: 3, y2: 4, width: 6 },
                            ],
                        },
                        mark: { type: "link", color: "#444" },
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            x2: { field: "x2", type: "quantitative" },
                            y: { field: "y", type: "quantitative" },
                            y2: { field: "y2", type: "quantitative" },
                            size: {
                                field: "width",
                                type: "quantitative",
                                scale: { domain: [0, 6], range: [1, 6] },
                            },
                        },
                    },
                ],
            });
            const symbols = getLegendUnitChild(getLegends(view)[0], "symbols");

            expect(/** @type {UnitView} */ (symbols).spec.mark).toEqual(
                expect.objectContaining({ type: "rule" })
            );
            expect(/** @type {UnitView} */ (symbols).spec.encoding).toEqual(
                expect.objectContaining({
                    color: { value: "#444" },
                    size: expect.objectContaining({
                        field: "value",
                        type: "quantitative",
                    }),
                })
            );
        });

        test("updates quantitative size entries when a dynamic range changes", async () => {
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
                        mark: "point",
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            y: { field: "y", type: "quantitative" },
                            size: {
                                field: "population",
                                type: "quantitative",
                                scale: {
                                    domain: [0, 100],
                                    range: [0, { expr: "height * 2" }],
                                },
                            },
                            color: { value: "#000" },
                        },
                    },
                ],
            });
            const legend = getLegends(view)[0];
            const labels = getLegendUnitChild(legend, "labels");
            const readMaxSymbolSize = () =>
                getUnitData(labels).find((datum) => datum.value == 100)
                    ._legendSymbolSize;
            const context = new NoOpRenderingContext({ picking: false });

            view.render(context, Rectangle.create(0, 0, 400, 160), {
                firstFacet: true,
            });
            await view.paramRuntime.whenPropagated();
            const small = readMaxSymbolSize();

            const requestLayoutReflow = vi.fn();
            view.context.requestLayoutReflow = requestLayoutReflow;
            const release = legend.suspendLayoutDataUpdates();

            view.render(context, Rectangle.create(0, 0, 400, 320), {
                firstFacet: true,
            });
            await view.paramRuntime.whenPropagated();
            await Promise.resolve();
            const suspended = readMaxSymbolSize();

            // During peek-like transitions, layout helper data waits for the
            // caller to release the suspension. Marks still use the live scale.
            expect(suspended).toBe(small);
            expect(requestLayoutReflow).not.toHaveBeenCalled();

            release();
            await Promise.resolve();

            const large = readMaxSymbolSize();
            expect(large).toBeGreaterThan(small);
            expect(requestLayoutReflow).toHaveBeenCalledTimes(1);
        });

        test("updates quantitative symbol legends when the source domain changes", async () => {
            const view = await createLegendTestView({
                params: [{ name: "upperBound", value: 1 }],
                config: { legend: { disable: false } },
                vconcat: [
                    {
                        data: {
                            values: [
                                { x: 1, y: 2, confidence: 0 },
                                { x: 2, y: 3, confidence: 1 },
                            ],
                        },
                        mark: "point",
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            y: { field: "y", type: "quantitative" },
                            opacity: {
                                field: "confidence",
                                type: "quantitative",
                                scale: {
                                    domain: {
                                        expr: "[0, upperBound]",
                                    },
                                },
                            },
                        },
                    },
                ],
            });
            const labels = getLegendUnitChild(getLegends(view)[0], "labels");
            const readMaxValue = () =>
                Math.max(...getUnitData(labels).map((datum) => datum.value));

            expect(readMaxValue()).toBe(1);

            view.paramRuntime.setValue("upperBound", 2);
            await view.paramRuntime.whenPropagated();

            expect(readMaxValue()).toBe(2);
        });
    });

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
                /** @type {UnitView} */ (ramp)
                    .getScaleResolution("y")
                    .getScale().props
            ).toEqual(expect.objectContaining({ domainTransition: false }));
            expect(
                /** @type {UnitView} */ (ramp).getScaleResolution("color")
            ).toBe(/** @type {UnitView} */ (plot).getScaleResolution("color"));
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
                labelData.every(
                    ({ position }) => position >= 0 && position <= 1
                )
            ).toBe(true);
            expect(
                labelData.every(({ label }) => typeof label == "string")
            ).toBe(true);

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
            const labelData = getLegendData(
                getLegends(view)[0],
                "gradientLabels"
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
                const ramp = getLegendUnitChild(legends[0], "gradientRamp");
                const plot = view
                    .getDescendants()
                    .find((descendant) => descendant.name == "grid0");

                expect(legends).toHaveLength(1);
                expect(ramp).toBeInstanceOf(UnitView);
                expect(
                    /** @type {UnitView} */ (ramp).getScaleResolution(channel)
                ).toBe(
                    /** @type {UnitView} */ (plot).getScaleResolution(channel)
                );
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
            expect(legendHeight.minPx).toBeGreaterThan(
                body.getSize().height.minPx
            );
            expect(body.getSize().height).toEqual({ grow: 1, minPx: 40 });
            expect(region.getParallelSize()).toBeUndefined();
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
                                legend: { orient: "bottom" },
                            },
                        },
                    },
                ],
            });
            const body = getLegendChild(getLegends(view)[0], "gradientBody");

            expect(body.getSize().width).toEqual({ grow: 1, minPx: 40 });
            expect(body.getSize().height).toEqual({ grow: 1 });
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
            expect(
                /** @type {UnitView} */ (ramp).getScaleResolution("color")
            ).toBe(/** @type {UnitView} */ (plot).getScaleResolution("color"));

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
                Math.abs(datum.value) < Math.abs(nearest.value)
                    ? datum
                    : nearest
            );

            expect(
                Math.min(...rampData.map(({ value }) => value))
            ).toBeLessThan(-4.5);
            expect(
                Math.max(...rampData.map(({ value }) => value))
            ).toBeGreaterThan(9);
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
                                legend: { values: [25, 75] },
                            },
                        },
                    },
                ],
            });
            const labelData = getLegendData(
                getLegends(view)[0],
                "gradientLabels"
            );

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
                rampData.map(({ position0, position1 }) => [
                    position0,
                    position1,
                ])
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

    describe("chrome behavior", () => {
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

        test("draws configured backgrounds for stacked legends", async () => {
            const view = await createLegendTestView({
                config: {
                    legend: {
                        disable: false,
                        backgroundFill: "white",
                        backgroundFillOpacity: 0.8,
                    },
                    view: { stroke: "lightgray" },
                },
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
                                        legend: { title: "Difference" },
                                    },
                                },
                            },
                        ],
                    },
                ],
            });
            const legendBackgrounds = getLegendRegions(view)[0]
                .getDescendants()
                .filter((descendant) =>
                    descendant.name.startsWith("background")
                );

            expect(
                legendBackgrounds.map((background) => background.name)
            ).toEqual(["background0", "background1"]);
            expect(
                legendBackgrounds.map(
                    (background) =>
                        /** @type {UnitView} */ (background).spec.mark
                )
            ).toEqual([
                expect.objectContaining({ color: "white", opacity: 0.8 }),
                expect.objectContaining({ color: "white", opacity: 0.8 }),
            ]);
        });
    });
});
