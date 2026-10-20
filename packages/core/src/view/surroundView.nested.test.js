import { describe, expect, test } from "vitest";
import {
    createHeadlessEngine,
    createTestViewContext,
    renderToLayout,
} from "./testUtils.js";
import Rectangle from "./layout/rectangle.js";
import { isInChromeSubtree } from "./viewChrome.js";
import Interaction from "../utils/interaction.js";
import Point from "./layout/point.js";
import { getSpecErrorLocation } from "../utils/specError.js";
import annotatedMatrix from "../../../../examples/docs/grammar/composition/surround/annotated-matrix.json" with { type: "json" };

const wheelProbeSource = /** @type {WheelEvent} */ ({
    type: "wheel",
    deltaX: 0,
    deltaY: -120,
    deltaMode: 0,
    ctrlKey: false,
    preventDefault() {},
});

/** @param {import("./view.js").default} root @param {string} name */
function plot(root, name) {
    return /** @type {import("./unitView.js").default} */ (
        root.getDescendants().find((view) => view.explicitName === name)
    );
}

/**
 * Uses an independent local measurement in every orientation, so nesting must
 * export the center's aligned scale rather than checking all descendant scales.
 * @param {import("../spec/view.js").Side} side
 * @returns {import("../spec/view.js").SurroundSpec}
 */
function fixture(side = "right") {
    const aligned = side === "top" || side === "bottom" ? "x" : "y";
    const local = aligned === "x" ? "y" : "x";
    const thickness = aligned === "x" ? "height" : "width";
    const summaryThickness = aligned === "x" ? "width" : "height";
    const summarySide = aligned === "x" ? "left" : "top";
    return {
        padding: 0,
        spacing: 8,
        data: {
            values: [
                { column: 0, row: 0 },
                { column: 1, row: 1 },
                { column: 2, row: 2 },
            ],
        },
        scales: {
            x: { type: "index", domain: [0, 2] },
            y: { type: "index", domain: [0, 2], reverse: true },
        },
        spec: {
            name: "matrix",
            width: 180,
            height: 120,
            mark: "rect",
            encoding: {
                x: { field: "column", type: "index", axis: null },
                y: { field: "row", type: "index", axis: null },
            },
        },
        surround: {
            [side]: {
                name: "metadata",
                data: {
                    values: [
                        { key: 0, total: 5 },
                        { key: 1, total: 15 },
                        { key: 2, total: 10 },
                    ],
                },
                views: [
                    {
                        name: "nested",
                        spacing: 8,
                        scales: {
                            [local]: {
                                type: "linear",
                                domain: [0, 20],
                                zoom: true,
                            },
                        },
                        spec: {
                            name: "measurement",
                            [thickness]: 80,
                            mark: "rect",
                            encoding: {
                                [aligned]: {
                                    field: "key",
                                    type: "index",
                                    axis: null,
                                },
                                [local]: {
                                    field: "total",
                                    type: "quantitative",
                                    axis: null,
                                },
                            },
                        },
                        surround: {
                            [summarySide]: [
                                {
                                    name: "summary",
                                    [summaryThickness]: 40,
                                    transform: [
                                        {
                                            type: "aggregate",
                                            groupby: ["total"],
                                            fields: ["key"],
                                            ops: ["count"],
                                            as: ["count"],
                                        },
                                    ],
                                    mark: "point",
                                    encoding: {
                                        [local]: {
                                            field: "total",
                                            type: "quantitative",
                                            axis: null,
                                        },
                                        [aligned]: {
                                            field: "count",
                                            type: "quantitative",
                                            axis: null,
                                            scale: {
                                                domain: [0, 3],
                                                zoom: false,
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    },
                ],
            },
        },
    };
}

/**
 * @param {"hconcat" | "vconcat"} composition
 * @param {import("../spec/view.js").UnitSpec["height"]} [centerHeight]
 * @param {import("../spec/view.js").UnitSpec["height"][]} [topHeights]
 * @returns {import("../spec/root.js").RootSpec}
 */
function growingFixture(
    composition,
    centerHeight = "container",
    topHeights = [{ grow: 2 }, { grow: 3 }]
) {
    const children = topHeights.map(
        /** @returns {import("../spec/view.js").SurroundSpec} */
        (height, i) => ({
            spacing: 0,
            spec: {
                name: "center" + i,
                width: "container",
                height: centerHeight,
                mark: "point",
            },
            surround: {
                top: [{ name: "top" + i, height, mark: "point" }],
            },
        })
    );
    return {
        data: { values: [{}] },
        padding: 0,
        spacing: 0,
        ...(composition === "hconcat"
            ? { hconcat: children }
            : { vconcat: children }),
    };
}

describe("nested surround", () => {
    test.each(/** @type {const} */ (["hconcat", "vconcat"]))(
        "%s aligns centers with differently growing margins across resizing",
        async (composition) => {
            // Uncapped arms expose feedback hidden by the acid test's max sizes.
            const { view } = await createHeadlessEngine(
                growingFixture(composition)
            );
            try {
                for (const [width, height] of [
                    [800, 800],
                    [960, 720],
                    [800, 800],
                ]) {
                    renderToLayout(view, Rectangle.create(0, 0, width, height));
                    const centers = [
                        plot(view, "center0"),
                        plot(view, "center1"),
                    ];
                    expect(centers[0].coords.height).toBeCloseTo(
                        centers[1].coords.height
                    );
                    for (const [i, center] of centers.entries()) {
                        const top = plot(view, "top" + i);
                        expect(top.coords.y2).toBeCloseTo(center.coords.y);
                        expect(top.coords.x).toBeCloseTo(center.coords.x);
                        expect(top.coords.width).toBeCloseTo(
                            center.coords.width
                        );
                        expect(top.coords.height).toBe(
                            Math.round(
                                (height * (i + 2)) /
                                    (composition === "hconcat" ? 4 : 7)
                            )
                        );
                        expect(center.coords.y2).toBeLessThanOrEqual(
                            height + 0.5
                        );
                    }
                }
            } finally {
                view.disposeSubtree();
            }
        }
    );

    test("shared growing margins retain constraints when the center reaches its maximum", async () => {
        const { view } = await createHeadlessEngine(
            growingFixture("hconcat", { grow: 1, maxPx: 100 }, [
                { grow: 2, maxPx: 250 },
                { grow: 3, minPx: 200, maxPx: 400 },
            ])
        );
        try {
            for (const [height, centerHeight, top0, top1] of [
                [300, 75, 150, 225],
                [800, 100, 250, 400],
                [300, 75, 150, 225],
            ]) {
                renderToLayout(view, Rectangle.create(0, 0, 800, height));
                for (const [i, topHeight] of [top0, top1].entries()) {
                    const center = plot(view, "center" + i);
                    const top = plot(view, "top" + i);
                    expect(center.coords.height).toBe(centerHeight);
                    expect(top.coords.height).toBe(topHeight);
                    expect(top.coords.y2).toBe(center.coords.y);
                }
            }
        } finally {
            view.disposeSubtree();
        }
    });

    test.each([180, { step: 12 }])(
        "ordinary concat aligns a plain plot with a surround center sized %j",
        async (width) => {
            const board = fixture();
            /** @type {import("../spec/view.js").UnitSpec} */ (
                board.spec
            ).width = width;
            const { x, ...otherScales } = board.scales;
            board.scales = otherScales;
            // Chrome suppression cannot remove the occupied metadata panels.
            board.overhang = { right: false, top: false };
            const { view } = await createHeadlessEngine({
                scales: { x },
                resolve: { scale: { x: "shared" } },
                vconcat: [
                    board,
                    {
                        name: "plain",
                        width,
                        height: 30,
                        data: { values: [{ column: 0 }] },
                        mark: "point",
                        encoding: {
                            x: { field: "column", type: "index", axis: null },
                        },
                    },
                ],
            });
            try {
                renderToLayout(view);
                const matrix = plot(view, "matrix");
                const plain = plot(view, "plain");
                const expectedWidth = typeof width === "number" ? width : 36;
                expect(matrix.coords.width).toBe(expectedWidth);
                expect(plain.coords.x).toBe(matrix.coords.x);
                expect(plain.coords.width).toBe(expectedWidth);
                expect(view.getOverhang().right).toBeGreaterThanOrEqual(80);
            } finally {
                view.disposeSubtree();
            }
        }
    );

    test.each(/** @type {const} */ (["top", "right", "bottom", "left"]))(
        "aligns exported centers on %s while retaining a local summary scale",
        async (side) => {
            const { view, context } = await createHeadlessEngine(fixture(side));
            try {
                renderToLayout(view);
                const aligned = side === "top" || side === "bottom" ? "x" : "y";
                const local = aligned === "x" ? "y" : "x";
                const dimension = aligned === "x" ? "width" : "height";
                const matrix = plot(view, "matrix");
                const body = plot(view, "measurement");
                const summary = plot(view, "summary");
                expect(body.getScaleResolution(aligned)).toBe(
                    matrix.getScaleResolution(aligned)
                );
                expect(summary.getScaleResolution(local)).toBe(
                    body.getScaleResolution(local)
                );
                expect(summary.getScaleResolution(aligned)).not.toBe(
                    matrix.getScaleResolution(aligned)
                );
                expect(body.getScaleResolution(local)).not.toBe(
                    matrix.getScaleResolution(local)
                );
                expect(body.coords[aligned]).toBe(matrix.coords[aligned]);
                expect(body.coords[dimension]).toBe(matrix.coords[dimension]);
                expect(
                    body.coords[aligned] -
                        summary.coords[aligned] -
                        summary.coords[dimension]
                ).toBe(8);
                expect(
                    context.dataFlow.dataSources.filter(
                        (source) => !isInChromeSubtree(source.view)
                    )
                ).toHaveLength(2);
            } finally {
                view.disposeSubtree();
            }
        }
    );

    test("categorical example shares metadata and colors while percentage y remains local", async () => {
        const { view, context } = await createHeadlessEngine(
            /** @type {import("../spec/root.js").RootSpec} */ (annotatedMatrix)
        );
        try {
            renderToLayout(view, Rectangle.create(0, 0, 640, 480));
            const matrix = plot(view, "matrix");
            const category = plot(view, "category");
            const distribution = plot(view, "categoryDistribution");
            const columns = plot(view, "columnMeans");
            expect(category.getScaleResolution("y")).toBe(
                matrix.getScaleResolution("y")
            );
            expect(distribution.getScaleResolution("y")).not.toBe(
                category.getScaleResolution("y")
            );
            expect(distribution.getScaleResolution("y")).not.toBe(
                columns.getScaleResolution("y")
            );
            expect(distribution.getScaleResolution("x")).toBe(
                category.getScaleResolution("x")
            );
            expect(category.getScaleResolution("x")).not.toBe(
                matrix.getScaleResolution("x")
            );
            expect(
                category.getScaleResolution("x").getScale().domain()
            ).toEqual(["TP53", "PIK3CA"]);
            expect(distribution.getScaleResolution("color")).toBe(
                category.getScaleResolution("color")
            );
            expect(distribution.getScaleResolution("color")).not.toBe(
                matrix.getScaleResolution("color")
            );
            expect(distribution.coords.y).toBe(columns.coords.y);
            expect(matrix.coords.y - distribution.coords.y).toBe(68);
            expect(category.coords.y).toBe(matrix.coords.y);
            expect(category.coords.height).toBe(matrix.coords.height);
            expect(distribution.coords.width).toBe(category.coords.width);
            expect(
                Array.from(columns.getCollector().getData(), (row) => row.mean)
            ).toEqual([13 / 3, 16 / 3, 5]);
            expect(
                Array.from(
                    plot(view, "rowMeans").getCollector().getData(),
                    (row) => row.mean
                )
            ).toEqual([5, 11 / 3, 6]);
            const values = Array.from(distribution.getCollector().getData());
            expect(
                values.map((row) => [
                    row.gene,
                    row.category,
                    row.count,
                    row.start,
                    row.end,
                ])
            ).toEqual([
                ["TP53", "WT", 2, 0, 2 / 3],
                ["TP53", "Mutated", 1, 2 / 3, 1],
                ["PIK3CA", "WT", 1, 0, 1 / 3],
                ["PIK3CA", "Mutated", 2, 1 / 3, 1],
            ]);
            expect(category.getCollector().getItemCount()).toBe(6);
            expect(
                context.dataFlow.dataSources.filter(
                    (source) => !isInChromeSubtree(source.view)
                )
            ).toHaveLength(2);
            expect(distribution.getAxisResolution("y").hostView).toBe(
                distribution
            );
            const initialWidth = matrix.coords.width;
            const initialHeight = matrix.coords.height;
            renderToLayout(view, Rectangle.create(0, 0, 780, 560));
            expect(matrix.coords.width).toBeGreaterThan(initialWidth);
            expect(matrix.coords.height).toBeGreaterThan(initialHeight);
            expect(category.coords.height).toBe(matrix.coords.height);
            expect(category.coords.y).toBe(matrix.coords.y);
            expect(distribution.coords.x).toBe(category.coords.x);
        } finally {
            view.disposeSubtree();
        }
    });

    test("a flat sibling follows the nested anchor and a growing outer center", async () => {
        const spec = fixture();
        /** @type {import("../spec/view.js").UnitSpec} */ (spec.spec).height = {
            grow: 1,
            minPx: 120,
        };
        const group =
            /** @type {import("../spec/view.js").SurroundSideSpec} */ (
                spec.surround.right
            );
        group.views.push({
            name: "labels",
            width: 30,
            mark: "text",
            encoding: {
                y: { field: "key", type: "index", axis: null },
                text: { field: "key" },
            },
        });
        const { view } = await createHeadlessEngine(spec);
        try {
            renderToLayout(view, Rectangle.create(0, 0, 400, 300));
            const matrix = plot(view, "matrix");
            for (const name of ["measurement", "labels"]) {
                expect(plot(view, name).coords.y).toBe(matrix.coords.y);
                expect(plot(view, name).coords.height).toBe(
                    matrix.coords.height
                );
            }
            expect(matrix.coords.height).toBe(252);
            const gapX = plot(view, "measurement").coords.x2 + 5;
            for (const [y, claimed] of /** @type {[number, boolean][]} */ ([
                [24, false],
                [matrix.coords.y + 20, true],
            ])) {
                const probe = new Interaction(new Point(gapX, y), {
                    type: "wheelclaimprobe",
                    sourceEvent: wheelProbeSource,
                });
                view.propagateInteraction(probe);
                expect(probe.wheelClaimed).toBe(claimed);
            }
        } finally {
            view.disposeSubtree();
        }
    });

    test("input reaches navigable gaps inside nested annotation groups", async () => {
        const spec = fixture();
        const nested = /** @type {import("../spec/view.js").SurroundSpec} */ (
            /** @type {import("../spec/view.js").SurroundSideSpec} */ (
                spec.surround.right
            ).views[0]
        );
        const summary = /** @type {import("../spec/view.js").UnitSpec[]} */ (
            nested.surround.top
        )[0];
        summary.height = 20;
        nested.surround.top = [summary, { ...summary, name: "summaryTwo" }];
        nested.surround.left = [
            {
                width: 0,
                mark: "point",
                encoding: {
                    y: { field: "key", type: "index", axis: null },
                },
            },
        ];
        const { view } = await createHeadlessEngine(spec);
        try {
            renderToLayout(view);
            const first = plot(view, "summary").coords;
            const probe = new Interaction(
                new Point(first.x + first.width / 2, first.y2 + 4),
                {
                    type: "wheelclaimprobe",
                    sourceEvent: wheelProbeSource,
                }
            );
            view.propagateInteraction(probe);
            expect(probe.wheelClaimed).toBe(true);
            const emptyCorner = new Interaction(
                new Point(first.x - 4, first.y + 4),
                {
                    type: "wheelclaimprobe",
                    sourceEvent: wheelProbeSource,
                }
            );
            expect(() => view.propagateInteraction(emptyCorner)).not.toThrow();
            expect(emptyCorner.wheelClaimed).toBe(false);
        } finally {
            view.disposeSubtree();
        }
    });

    test("ordinary concat keeps empty corners within its child input boundary", async () => {
        const board = fixture();
        board.surround.left = [{ width: 20, mark: "point" }];
        board.surround.top = [{ height: 40, mark: "point" }];
        const { view } = await createHeadlessEngine({
            vconcat: [
                board,
                {
                    mark: "point",
                    height: 40,
                    data: { values: [{ column: 0 }] },
                    encoding: {
                        x: { field: "column", type: "index", axis: null },
                    },
                },
            ],
            scales: { x: { type: "index", domain: [0, 2], zoom: true } },
            resolve: { scale: { x: "shared" } },
        });
        try {
            renderToLayout(view);
            const probe = new Interaction(new Point(10, 10), {
                type: "wheelclaimprobe",
                sourceEvent: wheelProbeSource,
            });
            view.propagateInteraction(probe);
            expect(probe.wheelClaimed).toBe(false);
        } finally {
            view.disposeSubtree();
        }
    });

    test("a nested center cannot force an aligned axis beyond its surround", async () => {
        const spec = fixture();
        const nested = /** @type {import("../spec/view.js").SurroundSpec} */ (
            /** @type {import("../spec/view.js").SurroundSideSpec} */ (
                spec.surround.right
            ).views[0]
        );
        const center = /** @type {import("../spec/view.js").UnitSpec} */ (
            nested.spec
        );
        center.encoding.y = { field: "key", type: "index" };
        center.resolve = { axis: { y: "forced" } };
        await expect(createHeadlessEngine(spec)).rejects.toThrow(
            "axes hoisted"
        );
    });

    test("visibility reserves the maximum active top extent", async () => {
        const hidden = new Set();
        const { view } = await createHeadlessEngine(
            /** @type {import("../spec/root.js").RootSpec} */ (annotatedMatrix),
            {
                contextOptions: {
                    isViewConfiguredVisible: (view) =>
                        !hidden.has(view.explicitName),
                },
            }
        );
        try {
            const cases = /** @type {[string[], number][]} */ ([
                [[], 68],
                [["categoryDistribution"], 68],
                [["columnMeans"], 68],
                [["columnMeans", "categoryDistribution"], 0],
                [[], 68],
            ]);
            for (const [names, expected] of cases) {
                hidden.clear();
                for (const name of names) hidden.add(name);
                view._invalidateCacheByPrefix("size", "progeny");
                renderToLayout(view);
                expect(plot(view, "matrix").coords.y).toBe(expected);
                expect(plot(view, "category").coords.height).toBe(
                    plot(view, "matrix").coords.height
                );
            }
        } finally {
            view.disposeSubtree();
        }
    });

    test("overlapping empty bounds route input to the occupied corner and structural collisions fail", async () => {
        const spec = fixture();
        spec.surround.top = [
            {
                name: "topBoard",
                spacing: 8,
                spec: {
                    name: "topMain",
                    height: 40,
                    mark: "point",
                    encoding: {
                        x: { field: "column", type: "index", axis: null },
                        y: { field: "row", type: "index", axis: null },
                    },
                },
                surround: {
                    bottom: [
                        {
                            name: "topBottom",
                            height: 60,
                            mark: "point",
                            encoding: {
                                x: {
                                    field: "column",
                                    type: "index",
                                    axis: null,
                                },
                            },
                        },
                    ],
                    right: [
                        {
                            name: "topWing",
                            width: 80,
                            mark: "point",
                            encoding: {
                                y: { field: "row", type: "index", axis: null },
                            },
                        },
                    ],
                },
            },
        ];
        const { view } = await createHeadlessEngine(spec);
        try {
            renderToLayout(view);
            const summary = plot(view, "summary");
            const top = plot(view, "topBoard");
            const point = new Point(
                summary.coords.x + 20,
                summary.coords.y + 20
            );
            expect(top.coords.containsPoint(point.x, point.y)).toBe(true);
            const event = new Interaction(
                point,
                /** @type {MouseEvent} */ (new Event("mousemove"))
            );
            view.propagateInteraction(event);
            expect(event.target).toBe(summary);
        } finally {
            view.disposeSubtree();
        }

        // Removing the bottom panel moves the top wing into the summary's area.
        /** @type {import("../spec/view.js").SurroundSpec} */ (
            spec.surround.top[0]
        ).surround.bottom = [];
        const context = createTestViewContext();
        context.getSpecOrigin = (source) =>
            "name" in source && source.name === "summary"
                ? "colliding-panel"
                : undefined;
        const { view: colliding } = await createHeadlessEngine(spec, {
            context,
        });
        try {
            try {
                renderToLayout(colliding);
                throw new Error("Expected a panel collision.");
            } catch (error) {
                expect(error.message).toMatch(/panels.*topWing.*summary/);
                expect(getSpecErrorLocation(error)).toEqual({
                    origin: "colliding-panel",
                    path: [],
                });
            }
        } finally {
            colliding.disposeSubtree();
        }
    });
    test("growing outer arms absorb fixed structural headroom in their flex slot", async () => {
        const spec = fixture();
        /** @type {import("../spec/view.js").UnitSpec} */ (spec.spec).height = {
            grow: 1,
            minPx: 120,
        };
        spec.surround.top = [
            {
                name: "outerTop",
                height: { grow: 0.25, minPx: 20 },
                mark: "point",
                encoding: {
                    x: { field: "column", type: "index", axis: null },
                },
            },
        ];
        const { view } = await createHeadlessEngine(spec);
        try {
            for (const height of [168, 400]) {
                renderToLayout(view, Rectangle.create(0, 0, 300, height));
                const matrix = plot(view, "matrix");
                const top = plot(view, "outerTop");
                expect(matrix.coords.y - top.coords.y2).toBe(8);
                expect(plot(view, "summary").coords.y).toBeGreaterThanOrEqual(
                    top.coords.y
                );
                expect(plot(view, "measurement").coords.y).toBe(
                    matrix.coords.y
                );
            }
        } finally {
            view.disposeSubtree();
        }
    });

    test.each([20, { grow: 0.25, minPx: 10, maxPx: 20 }])(
        "a short or capped arm stays adjacent to the center (%j)",
        async (height) => {
            const spec = /** @type {import("../spec/view.js").SurroundSpec} */ (
                structuredClone(annotatedMatrix)
            );
            /** @type {import("../spec/view.js").UnitSpec} */ (
                spec.spec
            ).height = { grow: 1, minPx: 120 };
            /** @type {import("../spec/view.js").UnitSpec[]} */ (
                spec.surround.top
            )[0].height = height;
            const { view } = await createHeadlessEngine(
                /** @type {import("../spec/root.js").RootSpec} */ (spec)
            );
            try {
                for (const canvasHeight of [188, 400]) {
                    renderToLayout(
                        view,
                        Rectangle.create(0, 0, 400, canvasHeight)
                    );
                    const matrix = plot(view, "matrix");
                    const top = plot(view, "columnMeans");
                    const summary = plot(view, "categoryDistribution");
                    expect(top.coords.height).toBe(20);
                    expect(matrix.coords.y - top.coords.y2).toBe(8);
                    expect(matrix.coords.y - summary.coords.y2).toBe(8);
                    expect(top.coords.y - summary.coords.y).toBe(40);
                }
            } finally {
                view.disposeSubtree();
            }
        }
    );

    test("corner occupancy follows a local legend stacked beyond its axis", async () => {
        const spec = fixture();
        const nested = /** @type {import("../spec/view.js").SurroundSpec} */ (
            /** @type {import("../spec/view.js").SurroundSideSpec} */ (
                spec.surround.right
            ).views[0]
        );
        const summarySpec =
            /** @type {import("../spec/view.js").UnitSpec[]} */ (
                nested.surround.top
            )[0];
        summarySpec.title = { text: "Summary", orient: "bottom" };
        summarySpec.encoding.x = {
            field: "total",
            type: "quantitative",
            axis: {
                orient: "bottom",
                minExtent: 20,
                maxExtent: 20,
                title: null,
            },
        };
        summarySpec.encoding.color = {
            field: "total",
            type: "nominal",
            scale: { domain: [5, 10, 15] },
            legend: { orient: "bottom", direction: "horizontal", title: null },
        };
        const { view } = await createHeadlessEngine(spec);
        try {
            renderToLayout(view);
            const summary = plot(view, "summary");
            // The generated guide belongs to the side concat, rather than the unit.
            const actualLegend = view
                .getDescendants()
                .find(
                    (view) =>
                        "legendProps" in view && view.dataParent === summary
                );
            const footprints = view
                .getLayoutFootprints()
                .filter((entry) => entry.view === summary);
            expect(actualLegend).toBeDefined();
            expect(actualLegend.coords.y).toBeGreaterThan(
                summary.coords.y2 + 20
            );
            expect(
                footprints.some(({ coords }) =>
                    coords.containsPoint(
                        actualLegend.coords.x + 1,
                        actualLegend.coords.y + 1
                    )
                )
            ).toBe(true);
        } finally {
            view.disposeSubtree();
        }
    });

    test("hidden colored layers leave no stale legend occupancy", async () => {
        const spec = fixture();
        const nested = /** @type {import("../spec/view.js").SurroundSpec} */ (
            /** @type {import("../spec/view.js").SurroundSideSpec} */ (
                spec.surround.right
            ).views[0]
        );
        const summary = /** @type {import("../spec/view.js").UnitSpec[]} */ (
            nested.surround.top
        )[0];
        const { name, height, transform, ...leaf } = summary;
        nested.surround.top = [
            {
                name,
                height,
                transform,
                layer: [
                    {
                        ...leaf,
                        name: "colored",
                        encoding: {
                            ...leaf.encoding,
                            color: {
                                field: "total",
                                type: "nominal",
                                scale: { domain: [5, 10, 15] },
                            },
                        },
                    },
                    leaf,
                ],
            },
        ];
        const { view } = await createHeadlessEngine(spec);
        try {
            renderToLayout(view);
            plot(view, "colored").spec.visible = false;
            view._invalidateCacheByPrefix("size", "progeny");
            expect(() => renderToLayout(view)).not.toThrow();
            expect(
                view
                    .getLayoutFootprints()
                    .every(({ coords }) => coords !== undefined)
            ).toBe(true);
        } finally {
            view.disposeSubtree();
        }
    });

    test("named side mutations retain alignment sizing and slot validation", async () => {
        const spec = fixture();
        const group =
            /** @type {import("../spec/view.js").SurroundSideSpec} */ (
                spec.surround.right
            );
        const nested = group.views.pop();
        // Keep the side initialized before exercising its ordinary mutation API.
        group.views.push({
            width: 10,
            mark: "point",
            encoding: { y: { field: "key", type: "index", axis: null } },
        });
        const { view } = await createHeadlessEngine(spec);
        try {
            const side = /** @type {import("./concatView.js").default} */ (
                view
                    .getDescendants()
                    .find((view) => view.explicitName === "metadata")
            );
            await side.addChildSpec(nested);
            renderToLayout(view);
            expect(plot(view, "measurement").coords.height).toBe(120);
            expect(plot(view, "measurement").coords.y).toBe(
                plot(view, "matrix").coords.y
            );
            await expect(side.addChildSpec({ hconcat: [] })).rejects.toThrow(
                "accepts unit or layer plots"
            );
        } finally {
            view.disposeSubtree();
        }
    });

    test("nested imports preserve imposed center sizing and step-sized structural panels", async () => {
        const spec = fixture();
        const group =
            /** @type {import("../spec/view.js").SurroundSideSpec} */ (
                spec.surround.right
            );
        const nested = /** @type {import("../spec/view.js").SurroundSpec} */ (
            group.views[0]
        );
        const summary = /** @type {import("../spec/view.js").UnitSpec[]} */ (
            nested.surround.top
        )[0];
        summary.height = { step: 10 };
        summary.encoding.y = {
            field: "count",
            type: "index",
            axis: null,
            scale: { domain: [0, 3] },
        };
        spec.templates = {
            body: /** @type {import("../spec/view.js").ViewSpec} */ (
                nested.spec
            ),
            board: nested,
        };
        nested.spec = { import: { template: "body" } };
        group.views = [{ import: { template: "board" } }];
        const { view } = await createHeadlessEngine(spec);
        try {
            renderToLayout(view);
            expect(plot(view, "measurement").coords.height).toBe(120);
            expect(plot(view, "summary").coords.height).toBe(40);
        } finally {
            view.disposeSubtree();
        }
    });

    test.each(["alignedSize", "growingInset"])(
        "rejects %s at the actual size declaration",
        async (kind) => {
            const spec = fixture();
            const group =
                /** @type {import("../spec/view.js").SurroundSideSpec} */ (
                    spec.surround.right
                );
            const nested =
                /** @type {import("../spec/view.js").SurroundSpec} */ (
                    group.views[0]
                );
            const offender =
                kind === "alignedSize"
                    ? /** @type {import("../spec/view.js").UnitSpec} */ (
                          nested.spec
                      )
                    : /** @type {import("../spec/view.js").UnitSpec[]} */ (
                          nested.surround.top
                      )[0];
            offender.height = kind === "alignedSize" ? 120 : { grow: 0.2 };
            const context = createTestViewContext();
            context.getSpecOrigin = (source) =>
                source === offender ? "invalid-size" : undefined;
            let view;
            try {
                try {
                    ({ view } = await createHeadlessEngine(spec, { context }));
                    renderToLayout(view);
                    throw new Error("Expected an invalid size rejection.");
                } catch (error) {
                    expect(getSpecErrorLocation(error)).toEqual({
                        origin: "invalid-size",
                        path: ["height"],
                    });
                }
            } finally {
                view?.disposeSubtree();
            }
        }
    );
});
