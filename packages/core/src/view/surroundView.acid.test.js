import { expect, test } from "vitest";
import acidTest from "../../../../examples/core/surround-acid-test.json" with { type: "json" };
import { createHeadlessEngine, renderToLayout } from "./testUtils.js";
import Rectangle from "./layout/rectangle.js";
import { isInChromeSubtree } from "./viewChrome.js";

/** @param {import("./view.js").default} root @param {string} name */
function findView(root, name) {
    return root.getDescendants().find((view) => view.explicitName === name);
}

test("acid test aligns matrices and reserves nested annotations across resizing and visibility changes", async () => {
    /** @type {Set<import("./view.js").default>} */
    const hidden = new Set();
    const { view, context } = await createHeadlessEngine(
        /** @type {import("../spec/root.js").RootSpec} */ (acidTest),
        {
            contextOptions: {
                isViewConfiguredVisible: (view) => !hidden.has(view),
            },
        }
    );
    try {
        const centers = view
            .getDescendants()
            .filter((view) => view.explicitName === "cells");
        const [east, north, south, west] = centers;
        const assertMatrixAlignment = () => {
            const visible = centers.filter((center) => center.isVisible());
            for (const [i, center] of visible.entries()) {
                // Step-sized margins can introduce subpixel rounding at borders.
                expect(center.coords.x).toBeCloseTo(visible[i % 2].coords.x, 0);
                expect(center.coords.y).toBeCloseTo(
                    visible[Math.floor(i / 2) * 2].coords.y,
                    0
                );
                expect(center.coords.width).toBeCloseTo(
                    visible[0].coords.width
                );
                expect(center.coords.height).toBeCloseTo(
                    visible[0].coords.height
                );
                expect(
                    center.getScaleResolution("x").getAxisLength()
                ).toBeCloseTo(center.coords.width);
                expect(
                    center.getScaleResolution("y").getAxisLength()
                ).toBeCloseTo(center.coords.height);
            }
        };
        const pairs = /** @type {const} */ ([
            [east, findView(view, "rowValues"), "y"],
            [east, findView(view, "rowGroups"), "y"],
            [east, findView(view, "rowLabels"), "y"],
            [north, findView(view, "columnValues"), "x"],
            [south, findView(view, "bottomValues"), "x"],
            [west, findView(view, "metadataCells"), "y"],
            [findView(view, "rowValues"), findView(view, "rowHistogram"), "x"],
            [
                findView(view, "rowHistogram"),
                findView(view, "histogramLabels"),
                "y",
            ],
            [
                findView(view, "columnValues"),
                findView(view, "columnHistogram"),
                "y",
            ],
            [
                findView(view, "columnHistogram"),
                findView(view, "columnCounts"),
                "x",
            ],
        ]);
        expect(centers).toHaveLength(4);
        expect(
            context.dataFlow.dataSources.filter(
                (source) => !isInChromeSubtree(source.view)
            )
        ).toHaveLength(2);

        for (const [width, height] of [
            [960, 720],
            [1280, 960],
            [1600, 1100],
        ]) {
            renderToLayout(view, Rectangle.create(0, 0, width, height));
            assertMatrixAlignment();
            for (const [center, annotation, channel] of pairs) {
                const dimension = channel === "x" ? "width" : "height";
                expect(annotation.getScaleResolution(channel)).toBe(
                    center.getScaleResolution(channel)
                );
                expect(annotation.coords[channel]).toBeCloseTo(
                    center.coords[channel]
                );
                expect(annotation.coords[dimension]).toBeCloseTo(
                    center.coords[dimension]
                );
            }
            for (const center of centers) {
                expect(center.coords.width).toBeGreaterThan(100);
                expect(center.coords.height).toBeGreaterThan(70);
            }

            // Occupied panels and guides must retain the concat's clearance.
            for (const [leftName, rightName] of [
                ["east", "north"],
                ["south", "west"],
            ]) {
                const left = findView(view, leftName);
                const right = findView(view, rightName);
                const leftBounds = Rectangle.unionAll(
                    left.getLayoutFootprints().map(({ coords }) => coords)
                );
                const rightBounds = Rectangle.unionAll(
                    right.getLayoutFootprints().map(({ coords }) => coords)
                );
                expect(leftBounds.x2).toBeLessThanOrEqual(left.coords.x2 + 0.5);
                expect(rightBounds.x).toBeGreaterThanOrEqual(
                    right.coords.x - 0.5
                );
                expect(rightBounds.x - leftBounds.x2).toBeGreaterThanOrEqual(
                    acidTest.spacing - 0.5
                );
            }

            // The histogram's side annotations occupy the corner above metadata.
            const values = findView(view, "rowValues").coords;
            const groups = findView(view, "rowGroups").coords;
            expect(groups.x - values.x2).toBe(6);
            expect(findView(view, "rowLabels").coords.x - groups.x2).toBe(6);
            expect(
                findView(view, "histogramLabels").coords.x2
            ).toBeLessThanOrEqual(findView(view, "rowBoard").coords.x2);
        }

        // A deep summary and a central plot must each collapse their footprint.
        const histogram = findView(view, "histogramBoard");
        const originalWidth = east.coords.width;
        const originalOverhang = findView(view, "rowBoard").getOverhang().right;
        hidden.add(histogram);
        view._invalidateCacheByPrefix("size", "progeny");
        renderToLayout(view, Rectangle.create(0, 0, 1600, 1100));
        assertMatrixAlignment();
        expect(findView(view, "rowHistogram").isVisible()).toBe(false);
        expect(findView(view, "rowBoard").getOverhang().right).toBeLessThan(
            originalOverhang
        );

        hidden.add(east.layoutParent);
        view._invalidateCacheByPrefix("size", "progeny");
        renderToLayout(view, Rectangle.create(0, 0, 1600, 1100));
        assertMatrixAlignment();
        expect(findView(view, "rowValues").isVisible()).toBe(false);
        expect(north.coords.x).toBeLessThan(south.coords.x);

        hidden.clear();
        view._invalidateCacheByPrefix("size", "progeny");
        renderToLayout(view, Rectangle.create(0, 0, 1600, 1100));
        assertMatrixAlignment();
        expect(findView(view, "rowHistogram").isVisible()).toBe(true);
        expect(east.coords.width).toBeCloseTo(originalWidth);
    } finally {
        view.disposeSubtree();
    }
});

test("acid test links matrix navigation while keeping nested measurements local", async () => {
    const { view } = await createHeadlessEngine(
        /** @type {import("../spec/root.js").RootSpec} */ (acidTest)
    );
    try {
        renderToLayout(view, Rectangle.create(0, 0, 1280, 900));
        const cells = view
            .getDescendants()
            .filter((view) => view.explicitName === "cells");
        const matrix = cells[0];
        for (const channel of /** @type {const} */ (["x", "y", "color"])) {
            for (const cell of cells) {
                expect(cell.getScaleResolution(channel)).toBe(
                    matrix.getScaleResolution(channel)
                );
            }
        }

        const rowMeasurement = findView(view, "rowValues").getScaleResolution(
            "x"
        );
        const columnMeasurement = findView(
            view,
            "columnValues"
        ).getScaleResolution("y");
        await rowMeasurement.zoomTo([2, 8]);
        await columnMeasurement.zoomTo([1, 7]);
        expect(matrix.getScaleResolution("x").getDomain()).toEqual([0, 12]);
        expect(matrix.getScaleResolution("y").getDomain()).toEqual([0, 10]);

        // Index zoomTo uses inclusive category endpoints, unlike getDomain.
        await matrix.getScaleResolution("x").zoomTo([3, 7]);
        await matrix.getScaleResolution("y").zoomTo([2, 6]);
        expect(matrix.getScaleResolution("x").getDomain()).toEqual([3, 8]);
        expect(matrix.getScaleResolution("y").getDomain()).toEqual([2, 7]);
        expect(rowMeasurement.getDomain()).toEqual([2, 8]);
        expect(columnMeasurement.getDomain()).toEqual([1, 7]);
        expect(
            findView(view, "metadataCells").getScaleResolution("x").getDomain()
        ).toEqual(["Q", "W"]);

        // Imported templates retain their panel's lexical phase parameter.
        const firstSignals = cells.map((cell) => {
            const data = /** @type {import("./unitView.js").default} */ (cell)
                .getCollector()
                .getData();
            return Array.from(data)[0].signal;
        });
        expect(new Set(firstSignals).size).toBe(4);
    } finally {
        view.disposeSubtree();
    }
});
