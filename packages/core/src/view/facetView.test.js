import { expect, test } from "vitest";
import { ViewFactory, VIEW_ROOT_NAME } from "./viewFactory.js";
import { createAndInitialize, createTestViewContext } from "./testUtils.js";
import ConcatView from "./concatView.js";
import FacetView from "./facetView.js";
import UnitView from "./unitView.js";
import { isChromeView } from "./viewSelectors.js";
import { getFlattenedViews } from "./viewUtils.js";
import {
    createFacetGrid,
    getFacetCellLayouts,
    getFacetGridSize,
    isRectVisible,
} from "./facetLayout.js";
import { FlexDimensions } from "./layout/flexLayout.js";
import Padding from "./layout/padding.js";
import Rectangle from "./layout/rectangle.js";

test("factory recognizes facet specs", () => {
    const factory = new ViewFactory();

    expect(
        factory.isViewSpec({
            facet: { field: "Series" },
            spec: { mark: "point" },
        })
    ).toBeTruthy();
});

test("root facet spec is wrapped in an implicit grid root", async () => {
    const context = createTestViewContext({ wrapRoot: true });
    const view = await context.createOrImportView(
        {
            facet: { field: "Series" },
            spec: {
                data: { values: [] },
                mark: "point",
            },
        },
        null,
        null,
        VIEW_ROOT_NAME
    );

    expect(view).toBeInstanceOf(ConcatView);
    expect(view.name).toBe("implicitRoot");
    expect(view.children).toHaveLength(1);
    expect(view.children[0]).toBeInstanceOf(FacetView);
});

test("shorthand facet groups by the column field", async () => {
    const context = createTestViewContext();
    const view = /** @type {FacetView} */ (
        await context.createOrImportView(
            {
                facet: { field: "Series" },
                spec: { mark: "point" },
            },
            null,
            null,
            "facet"
        )
    );

    expect(view.getFacetFields()).toEqual(["Series"]);
});

test("row and column facets group by row then column fields", async () => {
    const context = createTestViewContext();
    const view = /** @type {FacetView} */ (
        await context.createOrImportView(
            {
                facet: {
                    row: { field: "Origin" },
                    column: { field: "Cylinders" },
                },
                spec: { mark: "point" },
            },
            null,
            null,
            "facet"
        )
    );

    expect(view.getFacetFields()).toEqual(["Origin", "Cylinders"]);
});

test("row facet cannot be combined with wrapping columns", async () => {
    const context = createTestViewContext();

    await expect(() =>
        context.createOrImportView(
            {
                facet: {
                    row: { field: "Origin" },
                    column: { field: "Cylinders" },
                },
                columns: 2,
                spec: { mark: "point" },
            },
            null,
            null,
            "facet"
        )
    ).rejects.toThrow(
        'Facet "columns" can be used only with one-dimensional column facets.'
    );
});

test("facet creates one non-chrome child view", async () => {
    const context = createTestViewContext();
    const view = /** @type {FacetView} */ (
        await context.createOrImportView(
            {
                facet: { field: "Series" },
                spec: {
                    data: { values: [] },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                    },
                },
            },
            null,
            null,
            "facet"
        )
    );

    const nonChromeChildren = Array.from(view).filter(
        (child) => !isChromeView(child)
    );

    expect(nonChromeChildren).toEqual([view.child]);
    expect(view.child).toBeInstanceOf(UnitView);
});

test("descendant unit collectors group data by facet fields", async () => {
    const view = await createAndInitialize(
        {
            data: {
                values: [
                    { Series: "A", x: 1, y: 10 },
                    { Series: "B", x: 2, y: 20 },
                    { Series: "A", x: 3, y: 30 },
                ],
            },
            facet: { field: "Series" },
            spec: {
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    y: { field: "y", type: "quantitative" },
                },
            },
        },
        FacetView
    );

    const collector = getNonChromeUnitView(view).getCollector();

    expect(collector.facetBatches.get(["A"]).map((datum) => datum.x)).toEqual([
        1, 3,
    ]);
    expect(collector.facetBatches.get(["B"]).map((datum) => datum.x)).toEqual([
        2,
    ]);
});

test("anscombe-style facets expose sorted facet ids", async () => {
    const view = await createAndInitialize(
        {
            data: {
                values: [
                    { Series: "IV", X: 8, Y: 6.58 },
                    { Series: "II", X: 8, Y: 8.14 },
                    { Series: "I", X: 10, Y: 8.04 },
                    { Series: "III", X: 8, Y: 6.95 },
                    { Series: "I", X: 8, Y: 6.95 },
                ],
            },
            facet: { field: "Series" },
            columns: 2,
            spec: {
                mark: "point",
                encoding: {
                    x: { field: "X", type: "quantitative" },
                    y: { field: "Y", type: "quantitative" },
                },
            },
        },
        FacetView
    );

    expect(view.getFacetIds()).toEqual([["I"], ["II"], ["III"], ["IV"]]);
    expect(view.getFacetFactors()).toEqual({
        row: [],
        column: ["I", "II", "III", "IV"],
    });
});

test("row and column facets expose sorted factors", async () => {
    const view = await createAndInitialize(
        {
            data: {
                values: [
                    { Origin: "USA", Cylinders: 8, Horsepower: 150, MPG: 18 },
                    { Origin: "Europe", Cylinders: 4, Horsepower: 76, MPG: 30 },
                    { Origin: "Japan", Cylinders: 4, Horsepower: 65, MPG: 35 },
                    { Origin: "USA", Cylinders: 6, Horsepower: 105, MPG: 22 },
                    { Origin: "Europe", Cylinders: 6, Horsepower: 90, MPG: 25 },
                ],
            },
            facet: {
                row: { field: "Origin" },
                column: { field: "Cylinders" },
            },
            spec: {
                mark: "point",
                encoding: {
                    x: { field: "Horsepower", type: "quantitative" },
                    y: { field: "MPG", type: "quantitative" },
                },
            },
        },
        FacetView
    );

    expect(view.getFacetIds()).toEqual([
        ["Europe", 4],
        ["Europe", 6],
        ["Japan", 4],
        ["USA", 6],
        ["USA", 8],
    ]);
    expect(view.getFacetFactors()).toEqual({
        row: ["Europe", "Japan", "USA"],
        column: [4, 6, 8],
    });
});

test("facet collector observers are disposed with the view", async () => {
    const view = await createAndInitialize(
        {
            data: {
                values: [{ Series: "A", x: 1, y: 10 }],
            },
            facet: { field: "Series" },
            spec: {
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    y: { field: "y", type: "quantitative" },
                },
            },
        },
        FacetView
    );
    const collector = getNonChromeUnitView(view).getCollector();
    const observerCount = collector.observers.size;

    view.getFacetIds();
    expect(collector.observers.size).toBe(observerCount + 1);

    view.dispose();
    expect(collector.observers.size).toBe(observerCount);
});

test("facet layout wraps column facets into configured columns", () => {
    const grid = createFacetGrid(
        { row: undefined, column: { field: "Series" }, fields: ["Series"] },
        { row: [], column: ["I", "II", "III"] },
        2
    );
    const childSize = new FlexDimensions(
        { px: 100, grow: 0 },
        { px: 80, grow: 0 }
    );
    const size = getFacetGridSize(
        grid,
        childSize,
        Padding.zero(),
        undefined,
        4
    );
    const layouts = getFacetCellLayouts(
        grid,
        Rectangle.create(0, 0, size.width.px, size.height.px),
        childSize,
        Padding.zero(),
        undefined,
        4
    );

    expect(grid).toMatchObject({ nRows: 2, nCols: 2 });
    expect(
        grid.cells.map((cell) => [cell.facetId, cell.row, cell.column])
    ).toEqual([
        [["I"], 0, 0],
        [["II"], 0, 1],
        [["III"], 1, 0],
    ]);
    expect(size.width).toEqual({ px: 204, grow: 0 });
    expect(size.height).toEqual({ px: 186, grow: 0 });
    expect(layouts.map((layout) => rectTuple(layout.viewportCoords))).toEqual([
        [0, 22, 100, 80],
        [104, 22, 100, 80],
        [0, 106, 100, 80],
    ]);
});

test("facet layout creates row and column matrix cells", () => {
    const grid = createFacetGrid(
        {
            row: { field: "Origin" },
            column: { field: "Cylinders" },
            fields: ["Origin", "Cylinders"],
        },
        { row: ["Europe", "Japan"], column: [4, 6, 8] },
        undefined
    );
    const childSize = new FlexDimensions(
        { px: 100, grow: 0 },
        { px: 80, grow: 0 }
    );
    const size = getFacetGridSize(
        grid,
        childSize,
        Padding.zero(),
        undefined,
        4
    );
    const layouts = getFacetCellLayouts(
        grid,
        Rectangle.create(0, 0, size.width.px, size.height.px),
        childSize,
        Padding.zero(),
        undefined,
        4
    );

    expect(grid).toMatchObject({
        nRows: 2,
        nCols: 3,
        hasRowHeaders: true,
        hasColumnHeaders: true,
    });
    expect(grid.cells.map((cell) => cell.facetId)).toEqual([
        ["Europe", 4],
        ["Europe", 6],
        ["Europe", 8],
        ["Japan", 4],
        ["Japan", 6],
        ["Japan", 8],
    ]);
    expect(size.width).toEqual({ px: 330, grow: 0 });
    expect(size.height).toEqual({ px: 186, grow: 0 });
    expect(rectTuple(layouts[0].viewportCoords)).toEqual([22, 22, 100, 80]);
    expect(rectTuple(layouts[5].viewportCoords)).toEqual([230, 106, 100, 80]);
});

test("facet layout creates row-only facets", () => {
    const grid = createFacetGrid(
        { row: { field: "Origin" }, column: undefined, fields: ["Origin"] },
        { row: ["Europe", "Japan"], column: [] },
        undefined
    );
    const childSize = new FlexDimensions(
        { px: 100, grow: 0 },
        { px: 80, grow: 0 }
    );
    const size = getFacetGridSize(
        grid,
        childSize,
        Padding.zero(),
        undefined,
        4
    );
    const layouts = getFacetCellLayouts(
        grid,
        Rectangle.create(0, 0, size.width.px, size.height.px),
        childSize,
        Padding.zero(),
        undefined,
        4
    );

    expect(grid).toMatchObject({
        nRows: 2,
        nCols: 1,
        hasRowHeaders: true,
        hasColumnHeaders: false,
    });
    expect(
        grid.cells.map((cell) => [cell.facetId, cell.row, cell.column])
    ).toEqual([
        [["Europe"], 0, 0],
        [["Japan"], 1, 0],
    ]);
    expect(size.width).toEqual({ px: 122, grow: 0 });
    expect(size.height).toEqual({ px: 164, grow: 0 });
    expect(layouts.map((layout) => rectTuple(layout.viewportCoords))).toEqual([
        [22, 0, 100, 80],
        [22, 84, 100, 80],
    ]);
});

test("facet layout culls rectangles outside a clip", () => {
    const clip = { rect: Rectangle.create(0, 0, 10, 10) };

    expect(isRectVisible(Rectangle.create(20, 20, 5, 5), clip)).toBe(false);
    expect(isRectVisible(Rectangle.create(8, 8, 5, 5), clip)).toBe(true);
    expect(isRectVisible(Rectangle.create(20, 20, 5, 5), undefined)).toBe(true);
});

/**
 * @param {FacetView} view
 * @returns {UnitView}
 */
function getNonChromeUnitView(view) {
    const child = getFlattenedViews(view).find(
        (candidate) => candidate instanceof UnitView && !isChromeView(candidate)
    );

    expect(child).toBeInstanceOf(UnitView);
    return /** @type {UnitView} */ (child);
}

/**
 * @param {Rectangle} rect
 * @returns {[number, number, number, number]}
 */
function rectTuple(rect) {
    return [rect.x, rect.y, rect.width, rect.height];
}
