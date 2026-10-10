import { expect, test, vi } from "vitest";
import { ViewFactory, VIEW_ROOT_NAME } from "./viewFactory.js";
import {
    createAndInitialize,
    createTestViewContext,
    renderToLayout,
} from "./testUtils.js";
import ConcatView from "./concatView.js";
import FacetView from "./facetView.js";
import UnitView from "./unitView.js";
import { isChromeView, visitAddressableViews } from "./viewSelectors.js";
import { getFlattenedViews } from "./viewUtils.js";
import {
    createFacetGrid,
    getFacetCellLayouts,
    getFacetGridSize,
} from "./facetLayout.js";
import { FlexDimensions } from "./layout/flexLayout.js";
import Padding from "./layout/padding.js";
import Rectangle from "./layout/rectangle.js";
import DebugginViewRenderingContext from "./renderingContext/debuggingViewRenderingContext.js";
import {
    initializeViewSubtree,
    loadViewSubtreeData,
} from "../data/flowInit.js";
import { loadSharedExampleSpec } from "../spec/exampleFiles.js";

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
    const view = /** @type {ConcatView} */ (
        await context.createOrImportView(
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
        )
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

test.each([0, -1, 1.5, Infinity])(
    "facet rejects invalid wrapping column count %s before layout",
    async (columns) => {
        const context = createTestViewContext();
        await expect(
            context.createOrImportView(
                {
                    facet: { field: "Series" },
                    columns,
                    spec: { mark: "point" },
                },
                null,
                null,
                "facet"
            )
        ).rejects.toThrow('Facet "columns" must be a positive integer.');
    }
);

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

test.each(
    /** @type {Array<["scale" | "axis", "x" | "y", "facet" | "unit" | "layer"]>} */ ([
        ["scale", "x", "facet"],
        ["axis", "y", "facet"],
        ["scale", "x", "unit"],
        ["axis", "x", "unit"],
        ["scale", "x", "layer"],
    ])
)("facet rejects independent %s.%s on a %s", async (type, channel, owner) => {
    const context = createTestViewContext();
    /** @type {import("../spec/view.js").ResolveSpec["resolve"]} */
    const resolve = { [type]: { [channel]: "independent" } };
    // Pair scale and axis declarations to pass the generic shared-axis contract first.
    if (type === "scale") {
        resolve.axis = { [channel]: "independent" };
    }
    /** @type {import("../spec/view.js").UnitSpec} */
    const points = {
        mark: "point",
        encoding: {
            x: { field: "x", type: "quantitative" },
            y: { field: "y", type: "quantitative" },
        },
    };

    await expect(
        context.createOrImportView(
            {
                facet: { field: "Series" },
                resolve: owner === "facet" ? resolve : undefined,
                spec:
                    owner === "layer"
                        ? { resolve, layer: [points] }
                        : {
                              ...points,
                              resolve: owner === "unit" ? resolve : undefined,
                          },
            },
            null,
            null,
            "facet"
        )
    ).rejects.toThrow(
        `FacetView currently supports only shared ${type} resolutions. Channel "${channel}"`
    );
});

test("facet rejects an immediate nested facet child", async () => {
    const context = createTestViewContext();

    await expect(() =>
        context.createOrImportView(
            {
                facet: { field: "Series" },
                spec: /** @type {any} */ ({
                    facet: { field: "Group" },
                    spec: { mark: "point" },
                }),
            },
            null,
            null,
            "facet"
        )
    ).rejects.toThrow("Facet specs cannot contain an immediate facet child.");
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

test("column facet creates one chrome header view", async () => {
    const view = await createAndInitialize(
        createFixedSizeFacetSpec(["I", "II"]),
        FacetView
    );
    const headers = getFacetHeaderViews(view);
    /** @type {import("./view.js").default[]} */
    const addressableViews = [];

    visitAddressableViews(view, (candidate) => {
        addressableViews.push(candidate);
    });

    expect(headers.map((header) => header.name)).toEqual([
        "facetHeaderColumn0",
    ]);
    expect(headers.every((header) => isChromeView(header))).toBe(true);
    expect(addressableViews).not.toContain(headers[0]);
});

test("column facet headers reflect placement and replacement data", async () => {
    const view = await createAndInitialize(
        createFixedSizeFacetSpec(["I", "II"]),
        FacetView
    );
    const [header] = getFacetHeaderViews(view);
    renderToLayout(view, Rectangle.create(0, 0, 210, 78));
    expect(Array.from(header.getCollector().getData())).toMatchObject([
        { x: 50 / 210, y: 1 - 9 / 78, text: "I" },
        { x: 160 / 210, y: 1 - 9 / 78, text: "II" },
    ]);

    const source =
        /** @type {import("../data/sources/inlineSource.js").default} */ (
            view.flowHandle.dataSource
        );
    source.updateDynamicData([{ Series: "III", x: 1, y: 2 }]);
    renderToLayout(view);
    expect(
        Array.from(header.getCollector().getData(), (datum) => datum.text)
    ).toEqual(["III"]);
    view.disposeSubtree();
});

test("row and column facet creates one chrome header view per orientation", async () => {
    const view = await createAndInitialize(
        {
            data: {
                values: [
                    { Origin: "Europe", Cylinders: 4, x: 1, y: 2 },
                    { Origin: "Japan", Cylinders: 6, x: 3, y: 4 },
                ],
            },
            facet: {
                row: { field: "Origin" },
                column: { field: "Cylinders" },
            },
            spec: {
                width: 100,
                height: 50,
                mark: "point",
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        axis: null,
                    },
                    y: {
                        field: "y",
                        type: "quantitative",
                        axis: null,
                    },
                },
            },
        },
        FacetView
    );
    const headers = getFacetHeaderViews(view);

    expect(headers.map((header) => header.name)).toEqual([
        "facetHeaderColumn0",
        "facetHeaderRow0",
    ]);
    expect(headers.every((header) => isChromeView(header))).toBe(true);
});

test("facet headers are centered over plot area excluding overhang", async () => {
    const view = await createAndInitialize(
        {
            data: {
                values: [
                    { Origin: "Europe", Cylinders: 4, x: 1, y: 2 },
                    { Origin: "Japan", Cylinders: 6, x: 3, y: 4 },
                ],
            },
            facet: {
                row: { field: "Origin" },
                column: { field: "Cylinders" },
            },
            spec: {
                width: 100,
                height: 50,
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    y: { field: "y", type: "quantitative" },
                },
            },
        },
        FacetView
    );
    const [columnHeader, rowHeader] = getFacetHeaderViews(view);
    const columnSource =
        /** @type {import("../data/sources/inlineSource.js").default} */ (
            columnHeader.flowHandle.dataSource
        );
    const rowSource =
        /** @type {import("../data/sources/inlineSource.js").default} */ (
            rowHeader.flowHandle.dataSource
        );
    const columnUpdateSpy = vi.spyOn(columnSource, "updateDynamicData");
    const rowUpdateSpy = vi.spyOn(rowSource, "updateDynamicData");

    const layout = renderToLayout(view);
    const rootCoords = parseRectString(layout.coords);
    const firstPlotCoords = parseRectString(
        findLayoutNodes(layout, "facet0")[0].coords
    );
    const plotCenterX =
        (firstPlotCoords.x + firstPlotCoords.width / 2) / rootCoords.width;
    const plotCenterY =
        1 -
        (firstPlotCoords.y + firstPlotCoords.height / 2) / rootCoords.height;

    const columnData = /** @type {{ x: number, y: number, text: string }[]} */ (
        columnUpdateSpy.mock.calls[0][0]
    );
    const rowData = /** @type {{ x: number, y: number, text: string }[]} */ (
        rowUpdateSpy.mock.calls[0][0]
    );

    expect(columnData[0].x).toBeCloseTo(plotCenterX);
    expect(rowData[0].y).toBeCloseTo(plotCenterY);
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

test("column facet labels follow sorted collector factors", async () => {
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

    renderToLayout(view);
    const [header] = getFacetHeaderViews(view);
    expect(
        Array.from(header.getCollector().getData(), (datum) => datum.text)
    ).toEqual(["I", "II", "III", "IV"]);
});

test("matrix facets retain empty combinations in sorted factor order", async () => {
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

    const layout = renderToLayout(view);
    const [columns, rows] = getFacetHeaderViews(view);
    expect(
        Array.from(columns.getCollector().getData(), (datum) => datum.text)
    ).toEqual(["4", "6", "8"]);
    expect(
        Array.from(rows.getCollector().getData(), (datum) => datum.text)
    ).toEqual(["Europe", "Japan", "USA"]);
    expect(findLayoutNodes(layout, view.child.name)).toHaveLength(9);
});

test("facet layout reflows only when factor membership changes", async () => {
    const data = [
        { r: "A", c: 1 },
        { r: "B", c: 2 },
    ];
    const view = await createAndInitialize(
        {
            data: { values: data },
            facet: { row: { field: "r" }, column: { field: "c" } },
            spec: { width: 100, height: 80, mark: "point" },
        },
        FacetView
    );
    const initialSize = view.getSize();
    const reflow = vi.spyOn(view.context, "requestLayoutReflow");
    const source =
        /** @type {import("../data/sources/inlineSource.js").default} */ (
            view.flowHandle.dataSource
        );

    // This changes occupied combinations, but the Cartesian grid stays the same.
    source.updateDynamicData([...data, { r: "A", c: 2 }]);
    expect(view.getSize()).toEqual(initialSize);
    expect(reflow).not.toHaveBeenCalled();

    source.updateDynamicData([...data, { r: "C", c: 1 }]);
    expect(view.getSize().height.px).toBeGreaterThan(initialSize.height.px);
    expect(reflow).toHaveBeenCalledOnce();
    view.disposeSubtree();
});

test("facet factors retain input membership across differently filtered layers", async () => {
    const view = await createAndInitialize(
        {
            data: {
                values: [{ series: "C" }, { series: "B" }, { series: "A" }],
            },
            facet: { field: "series" },
            spec: {
                layer: [
                    {
                        transform: [
                            { type: "filter", expr: "datum.series !== 'C'" },
                        ],
                        mark: "point",
                    },
                    {
                        transform: [
                            { type: "filter", expr: "datum.series === 'B'" },
                        ],
                        mark: "point",
                    },
                ],
            },
        },
        FacetView
    );
    renderToLayout(view);
    const [header] = getFacetHeaderViews(view);
    expect(
        Array.from(header.getCollector().getData(), (datum) => datum.text)
    ).toEqual(["A", "B", "C"]);
    view.disposeSubtree();
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
    const collector = view.flowHandle.collector;
    const observerCount = collector.observers.size;

    view.getSize();
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
    expect(size.height).toEqual({ px: 208, grow: 0 });
    expect(layouts.map((layout) => rectTuple(layout.viewportCoords))).toEqual([
        [0, 22, 100, 80],
        [104, 22, 100, 80],
        [0, 128, 100, 80],
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

test("facet sizing preserves flex constraints while reserving guides", () => {
    const grid = createFacetGrid(
        { row: undefined, column: { field: "Series" }, fields: ["Series"] },
        { row: [], column: ["A", "B"] },
        undefined
    );
    const childSize = new FlexDimensions(
        { px: 100, grow: 1, minPx: 120, maxPx: 200 },
        { px: 80, grow: 0 }
    );
    const overhang = new Padding(0, 10, 0, 10);
    const size = getFacetGridSize(grid, childSize, overhang);
    const layouts = getFacetCellLayouts(
        grid,
        Rectangle.create(0, 0, 1000, 98),
        childSize,
        overhang
    );

    expect(size.width).toMatchObject({
        px: 240,
        grow: 2,
        minPx: 280,
        maxPx: 440,
    });
    expect(layouts.map((layout) => layout.childCoords.width)).toEqual([
        200, 200,
    ]);
});

test("facet layout places child plot inside reserved overhang", () => {
    const grid = createFacetGrid(
        { row: undefined, column: { field: "Series" }, fields: ["Series"] },
        { row: [], column: ["I"] },
        undefined
    );
    const childSize = new FlexDimensions(
        { px: 100, grow: 0 },
        { px: 80, grow: 0 }
    );
    const childOverhang = new Padding(10, 20, 30, 40);
    const layouts = getFacetCellLayouts(
        grid,
        Rectangle.create(0, 0, 160, 140),
        childSize,
        childOverhang,
        undefined,
        0
    );

    expect(rectTuple(layouts[0].viewportCoords)).toEqual([0, 18, 160, 120]);
    expect(rectTuple(layouts[0].childCoords)).toEqual([40, 28, 100, 80]);
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

test("facet size grows with wrapped facet count", async () => {
    const twoFacetView = await createAndInitialize(
        createFixedSizeFacetSpec(["I", "II"]),
        FacetView
    );
    const fourFacetView = await createAndInitialize(
        createFixedSizeFacetSpec(["I", "II", "III", "IV"]),
        FacetView
    );

    expect(twoFacetView.getSize()).toMatchObject({
        width: { px: 210, grow: 0 },
        height: { px: 78, grow: 0 },
    });
    expect(fourFacetView.getSize()).toMatchObject({
        width: { px: 210, grow: 0 },
        height: { px: 166, grow: 0 },
    });
});

test("invisible facet size is zero", async () => {
    const view = await createAndInitialize(
        {
            ...createFixedSizeFacetSpec(["I", "II"]),
            visible: false,
        },
        FacetView
    );
    view.context.isViewConfiguredVisible = (candidate) =>
        candidate.spec.visible ?? true;

    expect(view.getSize()).toMatchObject({
        width: { px: 0, grow: 0 },
        height: { px: 0, grow: 0 },
    });
});

test("implicit root grid uses facet viewport height", async () => {
    const root = await createAndInitializeWrappedRoot({
        ...createFixedSizeFacetSpec(["I", "II", "III", "IV"]),
        viewportHeight: 80,
    });
    const facet = /** @type {FacetView} */ (root.children[0]);

    expect(facet).toBeInstanceOf(FacetView);
    expect(facet.getSize().height).toEqual({ px: 166, grow: 0 });
    expect(facet.getViewportSize().height).toEqual({ px: 80, grow: 0 });
    expect(root.getSize().height).toEqual({ px: 80, grow: 0 });
});

test("facet root size can be measured before dataflow initialization", async () => {
    const context = createTestViewContext({ wrapRoot: true });
    const root = /** @type {ConcatView} */ (
        await context.createOrImportView(
            createFixedSizeFacetSpec(["I", "II", "III", "IV"]),
            null,
            null,
            VIEW_ROOT_NAME
        )
    );
    const facet = /** @type {FacetView} */ (root.children[0]);

    expect(root.getSize().height).toEqual({ px: 0, grow: 0 });

    const { dataSources } = initializeViewSubtree(root, root.context.dataFlow);
    await loadViewSubtreeData(root, dataSources);

    expect(facet.getSize().height).toEqual({ px: 166, grow: 0 });
    expect(root.getSize().height).toEqual({ px: 166, grow: 0 });
});

test("facet render repeats child at each facet cell", async () => {
    const view = await createAndInitialize(
        createFixedSizeFacetSpec(["I", "II", "III", "IV"]),
        FacetView
    );
    const layout = renderToLayout(view, Rectangle.create(0, 0, 210, 166));

    expect(
        findLayoutNodes(layout, "facet0").map((node) => node.coords)
    ).toEqual([
        "Rectangle: x: 0, y: 28, width: 100, height: 50",
        "Rectangle: x: 110, y: 28, width: 100, height: 50",
        "Rectangle: x: 0, y: 116, width: 100, height: 50",
        "Rectangle: x: 110, y: 116, width: 100, height: 50",
    ]);
});

test("facet render marks only first visible cell as first facet", async () => {
    const view = await createAndInitialize(
        createFixedSizeFacetSpec(["I", "II", "III", "IV"]),
        FacetView
    );
    const original = view.child.arrange.bind(view.child);
    /** @type {{ facetId: unknown, firstFacet: boolean | undefined }[]} */
    const calls = [];

    view.child.arrange = (context, coords, options = {}) => {
        calls.push({
            facetId: options.facetId,
            firstFacet: options.firstFacet,
        });
        return original(context, coords, options);
    };

    renderToLayout(view, Rectangle.create(0, 0, 210, 166));

    expect(calls).toEqual([
        { facetId: ["I"], firstFacet: true },
        { facetId: ["II"], firstFacet: false },
        { facetId: ["III"], firstFacet: false },
        { facetId: ["IV"], firstFacet: false },
    ]);
});

test.each([
    { clipX: true, clipY: true, visible: ["I"] },
    { clipX: false, clipY: true, visible: ["I", "II"] },
    { clipX: true, clipY: false, visible: ["I", "III"] },
])(
    "facet culling respects clip directions: $clipX/$clipY",
    async ({ clipX, clipY, visible }) => {
        const view = await createAndInitialize(
            createFixedSizeFacetSpec(["I", "II", "III", "IV"]),
            FacetView
        );
        const original = view.child.arrange.bind(view.child);
        /** @type {unknown[]} */
        const facetIds = [];

        view.child.arrange = (context, coords, options = {}) => {
            facetIds.push(options.facetId);
            return original(context, coords, options);
        };

        view.arrange(
            new DebugginViewRenderingContext({}),
            Rectangle.create(0, 0, 210, 166),
            {
                firstFacet: true,
                clip: {
                    rect: Rectangle.create(0, 0, 100, 80),
                    clipX,
                    clipY,
                },
            }
        );

        expect(facetIds).toEqual(visible.map((id) => [id]));
    }
);

test("anscombe wrapped facet example renders stable cell layout", async () => {
    const spec = loadSharedExampleSpec(
        "examples/core/facet/anscombe_wrapped.json"
    );
    spec.spec.width = 300;
    spec.spec.height = 300;
    spec.data = {
        values: [
            { Series: "I", X: 10, Y: 8.04 },
            { Series: "II", X: 10, Y: 9.14 },
            { Series: "III", X: 10, Y: 7.46 },
            { Series: "IV", X: 8, Y: 6.58 },
        ],
    };

    const view = await createAndInitialize(spec, FacetView);
    const layout = renderToLayout(view);

    expect(findLayoutNodes(layout, "facet0").map((node) => node.coords))
        .toMatchInlineSnapshot(`
          [
            "Rectangle: x: 32, y: 28, width: 300, height: 300",
            "Rectangle: x: 374, y: 28, width: 300, height: 300",
            "Rectangle: x: 32, y: 398, width: 300, height: 300",
            "Rectangle: x: 374, y: 398, width: 300, height: 300",
          ]
        `);
});

test("cars matrix facet example renders stable cell layout", async () => {
    const spec = loadSharedExampleSpec("examples/core/facet/cars_matrix.json");
    spec.spec.width = 150;
    spec.spec.height = 150;
    spec.data = {
        values: [
            {
                Origin: "Europe",
                Cylinders: 4,
                Horsepower: 76,
                Miles_per_Gallon: 30,
            },
            {
                Origin: "Europe",
                Cylinders: 6,
                Horsepower: 90,
                Miles_per_Gallon: 25,
            },
            {
                Origin: "Japan",
                Cylinders: 4,
                Horsepower: 65,
                Miles_per_Gallon: 35,
            },
            {
                Origin: "USA",
                Cylinders: 8,
                Horsepower: 150,
                Miles_per_Gallon: 18,
            },
        ],
    };

    const view = await createAndInitialize(spec, FacetView);
    const layout = renderToLayout(view);

    expect(findLayoutNodes(layout, "facet0").map((node) => node.coords))
        .toMatchInlineSnapshot(`
          [
            "Rectangle: x: 60, y: 28, width: 150, height: 150",
            "Rectangle: x: 252, y: 28, width: 150, height: 150",
            "Rectangle: x: 444, y: 28, width: 150, height: 150",
            "Rectangle: x: 60, y: 220, width: 150, height: 150",
            "Rectangle: x: 252, y: 220, width: 150, height: 150",
            "Rectangle: x: 444, y: 220, width: 150, height: 150",
            "Rectangle: x: 60, y: 412, width: 150, height: 150",
            "Rectangle: x: 252, y: 412, width: 150, height: 150",
            "Rectangle: x: 444, y: 412, width: 150, height: 150",
          ]
        `);
});

test("cars matrix facet example renders repeated chrome", async () => {
    const spec = loadSharedExampleSpec("examples/core/facet/cars_matrix.json");
    spec.spec.width = 150;
    spec.spec.height = 150;
    spec.data = {
        values: [
            {
                Origin: "Europe",
                Cylinders: 4,
                Horsepower: 76,
                Miles_per_Gallon: 30,
            },
            {
                Origin: "Japan",
                Cylinders: 6,
                Horsepower: 65,
                Miles_per_Gallon: 35,
            },
        ],
    };

    const view = await createAndInitialize(spec, FacetView);
    const layout = renderToLayout(view);

    expect(findLayoutNodes(layout, "facetHeaderColumn0")).toHaveLength(1);
    expect(findLayoutNodes(layout, "facetHeaderRow0")).toHaveLength(1);
    expect(findLayoutNodesByPrefix(layout, "axis_")).toHaveLength(8);
});

/**
 * @param {FacetView} view
 * @returns {UnitView}
 */
function getNonChromeUnitView(view) {
    const child = getFlattenedViews(view).find((candidate) => {
        return candidate instanceof UnitView && candidate.name === "facet0";
    });

    expect(child).toBeInstanceOf(UnitView);
    return /** @type {UnitView} */ (child);
}

/**
 * @param {FacetView} view
 * @returns {UnitView[]}
 */
function getFacetHeaderViews(view) {
    return getFlattenedViews(view)
        .filter((candidate) => candidate instanceof UnitView)
        .filter((candidate) => candidate.name.startsWith("facetHeader"));
}

/**
 * @param {Rectangle} rect
 * @returns {[number, number, number, number]}
 */
function rectTuple(rect) {
    return [rect.x, rect.y, rect.width, rect.height];
}

/**
 * @param {string} value
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
function parseRectString(value) {
    const match = value.match(
        /^Rectangle: x: ([\d.-]+), y: ([\d.-]+), width: ([\d.-]+), height: ([\d.-]+)$/
    );

    if (!match) {
        throw new Error("Invalid rectangle string: " + value);
    }

    return {
        x: Number(match[1]),
        y: Number(match[2]),
        width: Number(match[3]),
        height: Number(match[4]),
    };
}

/**
 * @param {{ viewName: string, coords: string, children: any[] }} layout
 * @param {string} viewName
 * @returns {{ viewName: string, coords: string, children: any[] }[]}
 */
function findLayoutNodes(layout, viewName) {
    return [
        ...(layout.viewName === viewName ? [layout] : []),
        ...layout.children.flatMap((child) => findLayoutNodes(child, viewName)),
    ];
}

/**
 * @param {{ viewName: string, coords: string, children: any[] }} layout
 * @param {string} prefix
 * @returns {{ viewName: string, coords: string, children: any[] }[]}
 */
function findLayoutNodesByPrefix(layout, prefix) {
    return [
        ...(layout.viewName.startsWith(prefix) ? [layout] : []),
        ...layout.children.flatMap((child) =>
            findLayoutNodesByPrefix(child, prefix)
        ),
    ];
}

/**
 * @param {string[]} series
 * @returns {import("../spec/root.js").RootSpec}
 */
function createFixedSizeFacetSpec(series) {
    return {
        data: {
            values: series.map((Series, index) => ({
                Series,
                x: index,
                y: index,
            })),
        },
        facet: { field: "Series" },
        columns: 2,
        spacing: 10,
        spec: {
            width: 100,
            height: 50,
            mark: "point",
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    axis: null,
                },
                y: {
                    field: "y",
                    type: "quantitative",
                    axis: null,
                },
            },
        },
    };
}

/**
 * @param {import("../spec/root.js").RootSpec} spec
 * @returns {Promise<ConcatView>}
 */
async function createAndInitializeWrappedRoot(spec) {
    const context = createTestViewContext({ wrapRoot: true });
    const view = /** @type {ConcatView} */ (
        await context.createOrImportView(spec, null, null, VIEW_ROOT_NAME)
    );

    view.visit((candidate) => {
        if (candidate instanceof UnitView) {
            candidate.mark.initializeEncoders();
        }
    });

    const { dataSources } = initializeViewSubtree(view, view.context.dataFlow);
    await loadViewSubtreeData(view, dataSources);

    return view;
}
