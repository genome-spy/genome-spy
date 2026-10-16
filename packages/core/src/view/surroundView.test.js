import { describe, expect, test } from "vitest";
import {
    createHeadlessEngine,
    createTestViewContext,
    renderToLayout,
} from "./testUtils.js";
import Rectangle from "./layout/rectangle.js";
import SurroundView from "./surroundView.js";
import { getZoomableResolutions } from "./gridView/zoomNavigationUtils.js";
import { initializeVisibleViewData } from "../genomeSpy/viewDataInit.js";
import { getAddressableViews } from "./viewSelectors.js";
import LegendView from "./legendView.js";
import { getSpecErrorLocation } from "../utils/specError.js";
import ConcatView from "./concatView.js";

/**
 * @param {string} field
 * @param {import("../spec/channel.js").Type} [type]
 * @returns {import("../spec/channel.js").PositionFieldDef}
 */
function field(field, type = "index") {
    return { field, type, axis: null };
}

/** @returns {import("../spec/view.js").SurroundSpec} */
function fixture() {
    return {
        name: "matrixWithTracks",
        data: {
            values: [
                { column: 0, row: 0, value: 2 },
                { column: 1, row: 1, value: 8 },
                { column: 2, row: 0, value: 12 },
            ],
        },
        params: [{ name: "offset", value: 3 }],
        config: {
            view: { step: 5, continuousWidth: 300, continuousHeight: 250 },
        },
        scales: {
            x: {
                type: "index",
                name: "columns",
                domain: [0, 2],
                gapPositions: [1],
                gapWidth: 5,
            },
            y: { type: "index", name: "rows", domain: [0, 1], reverse: true },
        },
        spacing: 7,
        spec: {
            name: "matrix",
            width: { step: 17 },
            height: { step: 19 },
            encoding: { x: field("column"), y: field("row") },
            layer: [{ name: "cells", mark: "rect" }],
        },
        surround: {
            top: [
                {
                    name: "totals",
                    height: 30,
                    mark: "point",
                    encoding: {
                        x: field("column"),
                        y: field("value", "quantitative"),
                    },
                },
                {
                    name: "topLabels",
                    height: 12,
                    mark: "text",
                    encoding: {
                        x: field("column"),
                        y: { value: 0.5 },
                        text: { field: "column" },
                    },
                },
            ],
            left: [
                {
                    name: "left",
                    width: 25,
                    mark: "point",
                    encoding: {
                        x: field("value", "quantitative"),
                        y: field("row"),
                    },
                },
            ],
            bottom: [
                {
                    name: "bottom",
                    height: 14,
                    mark: "point",
                    encoding: { x: field("column") },
                },
            ],
            right: {
                name: "metadata",
                data: {
                    values: [
                        { row: 0, measure: 10 },
                        { row: 1, measure: 20 },
                    ],
                },
                transform: [
                    {
                        type: "formula",
                        expr: "datum.measure + offset",
                        as: "shifted",
                    },
                ],
                encoding: { y: field("row") },
                spacing: 3,
                views: [
                    {
                        name: "right",
                        width: 20,
                        mark: "point",
                        encoding: { x: field("shifted", "quantitative") },
                    },
                    {
                        name: "rightLabels",
                        width: 35,
                        mark: "text",
                        encoding: {
                            x: { value: 0 },
                            text: { field: "shifted" },
                        },
                    },
                ],
            },
        },
    };
}

/**
 * @param {import("../spec/root.js").RootSpec} spec
 * @param {Parameters<typeof createHeadlessEngine>[1]} [options]
 */
async function init(spec, options) {
    const { view, context } = await createHeadlessEngine(spec, options);
    if (!(view instanceof SurroundView))
        throw new Error("Expected a surround view");
    return { view, context };
}

/** @param {SurroundView} view @param {string} name */
function plot(view, name) {
    return /** @type {import("./unitView.js").default} */ (
        view.findDescendantByName(name)
    );
}

/** @param {import("./view.js").default} view */
function arrange(view) {
    return renderToLayout(view, Rectangle.create(0, 0, 500, 400));
}

describe("flat surround", () => {
    test("aligns four sides, layers, and independent local scales with shared data scopes", async () => {
        const spec = fixture();
        const original = structuredClone(spec);
        const { view, context } = await init(spec);
        expect(view).toBeInstanceOf(SurroundView);
        arrange(view);

        const cells = plot(view, "cells");
        for (const name of ["totals", "topLabels", "bottom"]) {
            const child = plot(view, name);
            expect(child.getScaleResolution("x")).toBe(
                cells.getScaleResolution("x")
            );
            expect(child.coords.x).toBe(cells.coords.x);
            expect(child.coords.width).toBe(cells.coords.width);
        }
        for (const name of ["left", "right", "rightLabels"]) {
            const child = plot(view, name);
            expect(child.getScaleResolution("y")).toBe(
                cells.getScaleResolution("y")
            );
            expect(child.coords.y).toBe(cells.coords.y);
            expect(child.coords.height).toBe(cells.coords.height);
        }
        expect(plot(view, "totals").coords.y2).toBeLessThan(cells.coords.y);
        expect(plot(view, "bottom").coords.y).toBeGreaterThan(cells.coords.y2);
        expect(plot(view, "left").coords.x2).toBeLessThan(cells.coords.x);
        expect(plot(view, "right").coords.x).toBeGreaterThan(cells.coords.x2);
        expect(plot(view, "left").getScaleResolution("x")).not.toBe(
            plot(view, "right").getScaleResolution("x")
        );
        expect(plot(view, "totals").getScaleResolution("y")).not.toBe(
            cells.getScaleResolution("y")
        );
        expect(cells.getScaleResolution("x").name).toBe("columns");
        expect(cells.getScaleResolution("y").getScale().domain()).toEqual([
            0, 2,
        ]);
        expect(
            cells.getScaleResolution("y").getViewLevelScaleProps().props.reverse
        ).toBe(true);
        expect(cells.coords.width).toBe(
            view.findDescendantByName("matrix").getSize().width.px
        );
        expect(cells.coords.height).toBe(
            view.findDescendantByName("matrix").getSize().height.px
        );
        expect(
            Array.from(plot(view, "right").getCollector().getData()).map(
                (datum) => datum.shifted
            )
        ).toEqual([13, 23]);
        expect(
            Array.from(plot(view, "rightLabels").getCollector().getData()).map(
                (datum) => datum.shifted
            )
        ).toEqual([13, 23]);
        expect(context.dataFlow.dataSources).toHaveLength(2);
        expect(
            getAddressableViews(view).map((child) => child.explicitName)
        ).toContain("metadata");
        expect(spec).toEqual(original);
    });

    test("constant-coordinate tracks cannot navigate or declare axes against the center's perpendicular scale", async () => {
        const { view } = await init(fixture());
        const right = plot(view, "rightLabels");
        const top = plot(view, "topLabels");
        expect(right.getScaleResolution("x")).toBeUndefined();
        expect(right.getAxisResolution("x")).toBeUndefined();
        expect(top.getScaleResolution("y")).toBeUndefined();
        expect(top.getAxisResolution("y")).toBeUndefined();
        expect(getZoomableResolutions(right).x.size).toBe(0);
        expect(
            getZoomableResolutions(right).y.has(view.getScaleResolution("y"))
        ).toBe(true);
        expect(getZoomableResolutions(top).y.size).toBe(0);
        expect(
            getZoomableResolutions(top).x.has(view.getScaleResolution("x"))
        ).toBe(true);
    });

    test("side-local sharing, declarations, and axes remain independent of the matrix", async () => {
        const spec = fixture();
        spec.surround.right = {
            encoding: { y: field("row") },
            resolve: { scale: { x: "shared" } },
            scales: { x: { type: "linear", domain: [0, 30], zoom: true } },
            views: [
                {
                    name: "one",
                    width: 30,
                    mark: "point",
                    encoding: { x: { field: "value", type: "quantitative" } },
                    axes: { x: { title: "Value" } },
                },
                {
                    name: "two",
                    width: 40,
                    mark: "point",
                    encoding: { x: field("value", "quantitative") },
                },
            ],
        };
        const { view } = await init(spec);
        arrange(view);
        const one = plot(view, "one");
        const two = plot(view, "two");
        expect(one.getScaleResolution("x")).toBe(two.getScaleResolution("x"));
        expect(one.getScaleResolution("x")).not.toBe(
            view.getScaleResolution("x")
        );
        expect(one.getScaleResolution("x").getScale().domain()).toEqual([
            0, 30,
        ]);
        expect(one.getAxisResolution("x").hostView).toBe(one);
        expect(
            getZoomableResolutions(one).x.has(one.getScaleResolution("x"))
        ).toBe(true);
    });

    test("a typed perpendicular declaration without encoded members owns a local scale", async () => {
        const spec = fixture();
        spec.surround.right = {
            name: "declared",
            scales: { x: { type: "linear", domain: [100, 200] } },
            views: [
                {
                    name: "label",
                    width: 20,
                    mark: "point",
                    encoding: { y: field("row"), x: { value: 0.5 } },
                },
            ],
        };
        const { view } = await init(spec);
        expect(plot(view, "label").getScaleResolution("x")).not.toBe(
            view.getScaleResolution("x")
        );
        expect(
            plot(view, "label").getScaleResolution("x").getScale().domain()
        ).toEqual([100, 200]);
        expect(view.getScaleResolution("x").getScale().domain()).toEqual([
            0, 3,
        ]);
    });

    test("imports retain flat-plot support and aligned sizing", async () => {
        const spec = fixture();
        spec.templates = {
            track: {
                height: 23,
                layer: [
                    {
                        name: "importedMark",
                        mark: "point",
                        encoding: { x: field("column") },
                    },
                ],
            },
        };
        spec.surround.top = [
            { import: { template: "track" }, name: "imported" },
        ];
        const { view } = await init(spec);
        arrange(view);
        expect(plot(view, "importedMark").coords.width).toBe(
            plot(view, "cells").coords.width
        );
    });

    test("growing tracks and rotated titles preserve alignment with collected independent legends", async () => {
        const spec = fixture();
        const center = /** @type {import("../spec/view.js").LayerSpec} */ (
            spec.spec
        );
        center.width = "container";
        center.height = "container";
        center.encoding.color = {
            field: "value",
            type: "quantitative",
            legend: { title: "Expression" },
        };
        spec.resolve = { legend: { color: "collected" } };
        spec.config.legend = { orient: "bottom", direction: "horizontal" };
        spec.surround.top = [
            {
                name: "tree",
                height: { grow: 0.2 },
                mark: "point",
                encoding: {
                    x: field("column"),
                    y: field("value", "quantitative"),
                },
            },
        ];
        spec.surround.right = {
            encoding: { y: field("row") },
            views: [
                {
                    name: "annotation",
                    width: 16,
                    title: { text: "Metadata", orient: "bottom", angle: -90 },
                    mark: "rect",
                    encoding: {
                        color: {
                            field: "value",
                            type: "quantitative",
                            legend: { title: "Metadata" },
                        },
                    },
                },
            ],
        };
        const { view } = await init(spec);
        arrange(view);
        const cells = plot(view, "cells");
        const annotation = plot(view, "annotation");
        expect(annotation.coords.y).toBe(cells.coords.y);
        expect(annotation.coords.height).toBe(cells.coords.height);
        expect(plot(view, "tree").coords.width).toBe(cells.coords.width);
        expect(plot(view, "tree").coords.height).toBeGreaterThan(0);
        expect(annotation.getScaleResolution("color")).not.toBe(
            cells.getScaleResolution("color")
        );
        const legends = view
            .getDescendants()
            .filter((child) => child instanceof LegendView);
        expect(legends.map((legend) => legend.legendProps.title)).toEqual([
            "Expression",
            "Metadata",
        ]);
        expect(
            legends.every((legend) => legend.coords.y >= cells.coords.y2)
        ).toBe(true);
    });

    test("hidden tracks and an empty side collapse without repacking roles", async () => {
        const hidden = new Set(["left", "right", "rightLabels"]);
        const spec = fixture();
        spec.surround.bottom = [];
        const { view, context } = await init(spec, {
            contextOptions: {
                isViewConfiguredVisible: (view) =>
                    !hidden.has(view.explicitName),
            },
        });
        arrange(view);
        const cells = plot(view, "cells");
        const initial = cells.coords;
        expect(cells.coords.x).toBe(0);
        expect(plot(view, "right").getCollector()).toBeUndefined();

        hidden.clear();
        view.invalidateSizeCache();
        await initializeVisibleViewData(
            view,
            context.dataFlow,
            context.textMetrics
        );
        arrange(view);
        expect(plot(view, "left").coords.x2).toBeLessThan(cells.coords.x);
        expect(plot(view, "right").coords.x).toBeGreaterThan(cells.coords.x2);
        expect(cells.coords.y).toBe(initial.y);
        expect(plot(view, "right").getCollector().getItemCount()).toBe(2);
    });

    test("a hidden center skips side data initialization and can be restored", async () => {
        let visible = false;
        const { view, context } = await init(fixture(), {
            contextOptions: {
                isViewConfiguredVisible: (view) =>
                    view.explicitName !== "matrix" || visible,
            },
        });
        expect(view.isConfiguredVisible()).toBe(false);
        expect(plot(view, "right").getCollector()).toBeUndefined();
        visible = true;
        view.invalidateSizeCache();
        await initializeVisibleViewData(
            view,
            context.dataFlow,
            context.textMetrics
        );
        arrange(view);
        expect(plot(view, "right").getCollector().getItemCount()).toBe(2);
    });

    test.each([
        { hconcat: [] },
        { facet: { field: "row" }, spec: { mark: "point" } },
        { surround: {}, spec: { mark: "point" } },
    ])(
        "rejects unsupported flat slots after import expansion: %j",
        async (unsupported) => {
            const spec = fixture();
            spec.templates = {
                unsupported: /** @type {import("../spec/view.js").ViewSpec} */ (
                    unsupported
                ),
            };
            spec.surround.top = [{ import: { template: "unsupported" } }];
            await expect(init(spec)).rejects.toThrow(
                "currently accepts only unit or layer"
            );
        }
    );

    test("rejects authored aligned sizes and disconnected scales", async () => {
        const sized = fixture();
        sized.surround.top = [{ width: 200, mark: "point" }];
        await expect(init(sized)).rejects.toThrow("inherit width");
        const disconnected = fixture();
        disconnected.surround.top = [
            {
                resolve: { scale: { x: "excluded" } },
                mark: "point",
                encoding: { x: field("column") },
            },
        ];
        await expect(init(disconnected)).rejects.toThrow(
            "must share the center's x scale"
        );
        const detachedCenter = fixture();
        detachedCenter.spec = {
            layer: [
                { mark: "point", encoding: { x: field("column") } },
                {
                    mark: "point",
                    resolve: {
                        scale: { x: "excluded" },
                        axis: { x: "excluded" },
                    },
                    encoding: { x: field("column") },
                },
            ],
        };
        await expect(init(detachedCenter)).rejects.toThrow("Surround center");
    });

    test("rejects axes hoisted by a child and root input controllers", async () => {
        const hoisted = fixture();
        hoisted.spec = {
            mark: "point",
            resolve: { axis: { x: "forced" } },
            encoding: { x: field("column"), y: field("row") },
        };
        await expect(init(hoisted)).rejects.toThrow("axes hoisted");
        const input = fixture();
        input.params = [
            { name: "brush", select: { type: "interval", encodings: ["x"] } },
        ];
        await expect(init(input)).rejects.toThrow("input controllers");
    });

    test("reports the authored track for invalid aligned sizing", async () => {
        const spec = fixture();
        const invalid = { width: 100, mark: /** @type {const} */ ("point") };
        spec.surround.top = [invalid];
        const context = createTestViewContext();
        context.getSpecOrigin = (source) =>
            source === invalid ? "top-track" : undefined;
        await expect(init(spec, { context })).rejects.toSatisfy(
            (error) =>
                JSON.stringify(getSpecErrorLocation(error)) ===
                JSON.stringify({ origin: "top-track", path: ["width"] })
        );
    });

    test("ordinary excluded concats retain their existing ancestor lookup", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ value: 1 }] },
            resolve: { scale: { x: "shared" } },
            hconcat: [
                {
                    name: "scaled",
                    mark: "point",
                    encoding: { x: field("value", "quantitative") },
                },
                {
                    resolve: { scale: { x: "excluded" } },
                    hconcat: [
                        {
                            name: "constant",
                            mark: "point",
                            encoding: { x: { value: 0 } },
                        },
                    ],
                },
            ],
        });
        expect(view).toBeInstanceOf(ConcatView);
        const concat = /** @type {ConcatView} */ (view);
        expect(
            concat.findDescendantByName("constant").getScaleResolution("x")
        ).toBe(concat.getScaleResolution("x"));
    });
});
