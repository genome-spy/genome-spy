import { expect, test, vi } from "vitest";
import { VIEW_ROOT_NAME } from "./viewFactory.js";
import {
    createAndInitialize,
    createTestViewContext,
    renderToLayout,
} from "./testUtils.js";
import ConcatView from "./concatView.js";
import FacetView from "./facetView.js";
import UnitView from "./unitView.js";
import { isChromeView, visitAddressableViews } from "./viewSelectors.js";
import { calculateCanvasSize, getFlattenedViews } from "./viewUtils.js";
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

test.each([null, "invalid", { field: "x" }, ["A", null], [Infinity]])(
    "facet rejects unsupported category sort %j",
    async (sort) => {
        await expect(
            createAndInitialize(
                {
                    facet: /** @type {any} */ ({ field: "g", sort }),
                    spec: { mark: "point" },
                },
                FacetView
            )
        ).rejects.toThrow("Facet sort must be");
    }
);

test.each(
    /** @type {const} */ ([
        ["scale", "color"],
        ["legend", "color"],
        ["scale", "size"],
        ["legend", "default"],
    ])
)("facet rejects independent per-cell %s.%s", async (type, channel) => {
    await expect(
        createAndInitialize(
            {
                facet: { field: "g" },
                resolve: { [type]: { [channel]: "independent" } },
                spec: { mark: "point" },
            },
            FacetView
        )
    ).rejects.toThrow(
        `FacetView currently supports only shared ${type} resolutions. Channel "${channel}"`
    );
});

test("layers retain independent color scales shared across facet cells", async () => {
    const facet = await createAndInitialize(
        {
            data: {
                values: [
                    { g: "A", a: "red", b: "small" },
                    { g: "B", a: "blue", b: "large" },
                ],
            },
            facet: { field: "g" },
            spec: {
                resolve: { scale: { color: "independent" } },
                layer: [
                    {
                        mark: "point",
                        encoding: { color: { field: "a", type: "nominal" } },
                    },
                    {
                        mark: "point",
                        encoding: { color: { field: "b", type: "nominal" } },
                    },
                ],
            },
        },
        FacetView
    );
    try {
        const layer = /** @type {import("./layerView.js").default} */ (
            facet.child
        );
        const [a, b] = layer.children.map((view) =>
            view.getScaleResolution("color")
        );
        expect(a).not.toBe(b);
        expect(a.getDomain()).toEqual(["red", "blue"]);
        expect(b.getDomain()).toEqual(["small", "large"]);
    } finally {
        facet.disposeSubtree();
    }
});

test.each(["viewportWidth", "viewportHeight"])(
    "facet rejects child %s instead of compressing content",
    async (viewport) => {
        await expect(
            createAndInitialize(
                {
                    facet: { field: "g" },
                    spec: { layer: [{ mark: "point", [viewport]: 60 }] },
                },
                FacetView
            )
        ).rejects.toThrow(
            "Facet children do not support viewportWidth or viewportHeight. Set the viewport on the facet instead."
        );
    }
);

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
    expect(Array.from(view).filter((child) => !isChromeView(child))).toEqual([
        view.child,
    ]);
    expect(addressableViews).not.toContain(headers[0]);
});

test("column facet headers reflect placement and replacement data", async () => {
    const view = await createAndInitialize(
        createFixedSizeFacetSpec(["I", "II"]),
        FacetView
    );
    const [header] = getFacetHeaderViews(view);
    renderToLayout(view, Rectangle.create(0, 0, 210, 100));
    expect(Array.from(header.getCollector().getData())).toMatchObject([
        { x: 50 / 210, y: 1 - 9 / 78, text: "I" },
        { x: 160 / 210, y: 1 - 9 / 78, text: "II" },
    ]);

    // Layout invalidation alone must not republish identical label data.
    const revision = header.getCollector().dataRevision;
    view.invalidateSizeCache();
    renderToLayout(view, Rectangle.create(0, 0, 210, 100));
    expect(header.getCollector().dataRevision).toBe(revision);
    renderToLayout(view, Rectangle.create(0, 0, 320, 100));
    expect(header.getCollector().dataRevision).toBeGreaterThan(revision);

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
    const layout = renderToLayout(view);
    const firstPlotCoords = parseRectString(
        findLayoutNodes(layout, "facet0")[0].coords
    );
    const [columnData] = columnHeader.getCollector().getData();
    const [rowData] = rowHeader.getCollector().getData();
    expect(
        columnHeader.coords.x + columnData.x * columnHeader.coords.width
    ).toBeCloseTo(firstPlotCoords.x + firstPlotCoords.width / 2);
    expect(
        rowHeader.coords.y + (1 - rowData.y) * rowHeader.coords.height
    ).toBeCloseTo(firstPlotCoords.y + firstPlotCoords.height / 2);
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

test.each(
    /** @type {Array<[import("../spec/channel.js").FacetFieldDef["sort"], string[]]>} */ ([
        [undefined, ["I", "II", "III", "IV"]],
        ["descending", ["IV", "III", "II", "I"]],
        [
            ["III", "absent", "III", "I"],
            ["III", "I", "IV", "II"],
        ],
        [[], ["IV", "II", "I", "III"]],
    ])
)("column facet cells and labels follow sort %j", async (sort, expected) => {
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
            facet: { field: "Series", sort },
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
    ).toEqual(expected);
    expect(Array.from(view.child.facetCoords.keys())).toEqual(
        expected.map((value) => [value])
    );
    view.disposeSubtree();
});

test("matrix sorting applies independently and follows replacement input order", async () => {
    const view = await createAndInitialize(
        {
            data: {
                values: [
                    { r: "A", c: 2 },
                    { r: "B", c: 3 },
                    { r: "A", c: 4 },
                    { r: "B", c: 1 },
                ],
            },
            facet: {
                row: { field: "r", sort: "descending" },
                column: { field: "c", sort: [1] },
            },
            spec: { mark: "point" },
        },
        FacetView
    );
    renderToLayout(view);
    expect(Array.from(view.child.facetCoords.keys())).toEqual([
        ["B", 1],
        ["B", 2],
        ["B", 3],
        ["B", 4],
        ["A", 1],
        ["A", 2],
        ["A", 3],
        ["A", 4],
    ]);

    const source =
        /** @type {import("../data/sources/inlineSource.js").default} */ (
            view.flowHandle.dataSource
        );
    source.updateDynamicData([
        { r: "C", c: 3 },
        { r: "A", c: 2 },
        { r: "C", c: 1 },
    ]);
    renderToLayout(view);
    expect(Array.from(view.child.facetCoords.keys())).toEqual([
        ["C", 1],
        ["C", 3],
        ["C", 2],
        ["A", 1],
        ["A", 3],
        ["A", 2],
    ]);
    view.disposeSubtree();
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

test.each(
    /** @type {Array<[import("../spec/view.js").FacetSpec["facet"], number | undefined, [number, number], number]>} */ ([
        [
            { row: { field: "r", header: null }, column: { field: "c" } },
            undefined,
            [210, 160],
            1,
        ],
        [
            {
                row: { field: "r", header: { labels: false } },
                column: { field: "c" },
            },
            undefined,
            [232, 160],
            1,
        ],
        [
            { row: { field: "r" }, column: { field: "c", header: null } },
            undefined,
            [260, 110],
            1,
        ],
        [
            {
                row: { field: "r", header: null },
                column: { field: "c", header: null },
            },
            undefined,
            [210, 110],
            0,
        ],
        [{ field: "c", header: { labels: false } }, 1, [100, 132], 0],
        [{ row: { field: "r", header: null } }, undefined, [100, 110], 0],
    ])
)(
    "hidden headers reclaim space without changing facet layout %j",
    async (facet, columns, size, headerCount) => {
        const view = await createAndInitialize(
            {
                data: {
                    values: [
                        { r: "A", c: 1 },
                        { r: "B", c: 2 },
                    ],
                },
                facet,
                columns,
                spec: { width: 100, height: 50, mark: "point" },
            },
            FacetView
        );
        expect([view.getSize().width.px, view.getSize().height.px]).toEqual(
            size
        );
        renderToLayout(view, Rectangle.create(0, 0, ...size));
        expect(getFacetHeaderViews(view)).toHaveLength(headerCount);
        const cells = Array.from(view.child.facetCoords.values());
        expect(cells.map((cell) => [cell.width, cell.height])).toEqual(
            cells.map(() => [100, 50])
        );
        // Matrix orientation and empty combinations survive hidden row headers.
        if ("row" in facet && "column" in facet) {
            expect(Array.from(view.child.facetCoords.keys())).toEqual([
                ["A", 1],
                ["A", 2],
                ["B", 1],
                ["B", 2],
            ]);
            expect(cells[0].y).toBe(cells[1].y);
            expect(cells[2].y - cells[0].y).toBe(60);
            const columnHeader = getFacetHeaderViews(view).find((header) =>
                header.name.startsWith("facetHeaderColumn")
            );
            if (columnHeader) {
                expect(
                    Array.from(
                        columnHeader.getCollector().getData(),
                        (datum) => datum.text
                    )
                ).toEqual(["1", "2"]);
            }
        }
        view.disposeSubtree();
    }
);

test.each([
    false,
    [],
    "none",
    { labels: "false" },
    { title: "Group" },
    { format: 1 },
])("facet rejects unsupported header options %j", async (header) => {
    await expect(
        createAndInitialize(
            {
                facet: /** @type {any} */ ({ field: "g", header }),
                spec: { mark: "point" },
            },
            FacetView
        )
    ).rejects.toThrow("Facet header must be");
});

test("invalid numeric header formats fail before rendering", async () => {
    await expect(
        createAndInitialize(
            {
                facet: { field: "g", header: { format: "invalid" } },
                spec: { mark: "point" },
            },
            FacetView
        )
    ).rejects.toThrow("invalid format");
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
    const size = getFacetGridSize(grid, childSize, () => Padding.zero(), {
        row: 4,
        column: 4,
    });
    const layouts = getFacetCellLayouts(
        grid,
        Rectangle.create(0, 0, size.width.px, size.height.px),
        childSize,
        () => Padding.zero(),
        { row: 4, column: 4 }
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
    const size = getFacetGridSize(grid, childSize, () => Padding.zero(), {
        row: 4,
        column: 4,
    });
    const layouts = getFacetCellLayouts(
        grid,
        Rectangle.create(0, 0, size.width.px, size.height.px),
        childSize,
        () => Padding.zero(),
        { row: 4, column: 4 }
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
    const size = getFacetGridSize(grid, childSize, () => overhang);
    const layouts = getFacetCellLayouts(
        grid,
        Rectangle.create(0, 0, 1000, 98),
        childSize,
        () => overhang
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
        () => childOverhang
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
    const size = getFacetGridSize(grid, childSize, () => Padding.zero(), {
        row: 4,
        column: 4,
    });
    const layouts = getFacetCellLayouts(
        grid,
        Rectangle.create(0, 0, size.width.px, size.height.px),
        childSize,
        () => Padding.zero(),
        { row: 4, column: 4 }
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
        height: { px: 100, grow: 0 },
    });
    expect(fourFacetView.getSize()).toMatchObject({
        width: { px: 210, grow: 0 },
        height: { px: 188, grow: 0 },
    });
});

test.each(
    /** @type {Array<[boolean, import("../spec/view.js").FacetSpacing, number, number]>} */ ([
        [false, { row: 3, column: 17 }, 3, 17],
        [true, { row: 3, column: 17 }, 3, 17],
        [false, { column: 17 }, 10, 17],
        [true, { row: 0, column: 0 }, 0, 0],
    ])
)(
    "directional spacing sizes and positions cells and headers (wrapped: %s, %j)",
    async (wrapped, spacing, rowGap, columnGap) => {
        const view = await createAndInitialize(
            {
                data: {
                    values: [
                        { r: "A", c: 1 },
                        { r: "B", c: 2 },
                    ],
                },
                facet: wrapped
                    ? { field: "c" }
                    : { row: { field: "r" }, column: { field: "c" } },
                columns: wrapped ? 1 : undefined,
                spacing,
                spec: { width: 100, height: 50, mark: "point" },
            },
            FacetView
        );
        const width = wrapped ? 100 : 240 + 2 * columnGap;
        const height = wrapped ? 158 + 3 * rowGap : 140 + 2 * rowGap;
        expect([view.getSize().width.px, view.getSize().height.px]).toEqual([
            width,
            height,
        ]);
        renderToLayout(view, Rectangle.create(0, 0, width, height));
        const cells = Array.from(view.child.facetCoords.values());
        expect(rectTuple(cells[0])).toEqual([
            wrapped ? 0 : 40 + columnGap,
            40 + rowGap,
            100,
            50,
        ]);
        expect(cells.at(-1).y - cells[0].y).toBe(
            wrapped ? 68 + 2 * rowGap : 50 + rowGap
        );
        if (!wrapped) {
            expect(cells[1].x - cells[0].x).toBe(100 + columnGap);
        }
        const [header] = getFacetHeaderViews(view);
        const labels = Array.from(header.getCollector().getData());
        expect((1 - labels[0].y) * header.coords.height).toBeCloseTo(9);
        if (wrapped) {
            expect(
                (labels[0].y - labels[1].y) * header.coords.height
            ).toBeCloseTo(68 + 2 * rowGap);
        }
        view.disposeSubtree();
    }
);

test.each([
    -1,
    Infinity,
    null,
    [],
    "10",
    { row: -1 },
    { column: null },
    { row: NaN },
    { column: "10" },
    { extra: 10 },
])("facet rejects invalid spacing %j before layout", async (spacing) => {
    await expect(
        createAndInitialize(
            {
                facet: { field: "g" },
                spacing: /** @type {any} */ (spacing),
                spec: { mark: "point" },
            },
            FacetView
        )
    ).rejects.toThrow("Facet spacing must");
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
    expect(facet.getSize().height).toEqual({ px: 188, grow: 0 });
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

    // The shared title can be measured before category data arrives.
    expect(root.getSize().height).toEqual({ px: 22, grow: 0 });

    const { dataSources } = initializeViewSubtree(root, root.context.dataFlow);
    await loadViewSubtreeData(root, dataSources);

    expect(facet.getSize().height).toEqual({ px: 188, grow: 0 });
    expect(root.getSize().height).toEqual({ px: 188, grow: 0 });
});

test("flexible facet root fits its container before and after data initialization", async () => {
    const context = createTestViewContext({ wrapRoot: true });
    const spec = createFixedSizeFacetSpec(["I", "II", "III", "IV"]);
    delete spec.spec.width;
    delete spec.spec.height;
    const root = await context.createOrImportView(
        spec,
        null,
        null,
        VIEW_ROOT_NAME
    );

    // Browser startup measures the root before loading the facet categories.
    expect(root.getSize().isGrowing()).toBe(true);
    expect(calculateCanvasSize(root)).toEqual({
        width: undefined,
        height: undefined,
    });

    const { dataSources } = initializeViewSubtree(root, context.dataFlow);
    await loadViewSubtreeData(root, dataSources);

    expect(root.getSize().isGrowing()).toBe(true);
    expect(calculateCanvasSize(root)).toEqual({
        width: undefined,
        height: undefined,
    });
});

test("facet render repeats child at each facet cell", async () => {
    const view = await createAndInitialize(
        createFixedSizeFacetSpec(["I", "II", "III", "IV"]),
        FacetView
    );
    const layout = renderToLayout(view, Rectangle.create(0, 0, 210, 188));

    expect(
        findLayoutNodes(layout, "facet0").map((node) => node.coords)
    ).toEqual([
        "Rectangle: x: 0, y: 50, width: 100, height: 50",
        "Rectangle: x: 110, y: 50, width: 100, height: 50",
        "Rectangle: x: 0, y: 138, width: 100, height: 50",
        "Rectangle: x: 110, y: 138, width: 100, height: 50",
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
            "Rectangle: x: 32, y: 50, width: 300, height: 300",
            "Rectangle: x: 342, y: 50, width: 300, height: 300",
            "Rectangle: x: 32, y: 388, width: 300, height: 300",
            "Rectangle: x: 342, y: 388, width: 300, height: 300",
          ]
        `);
});

test("cars matrix facet example renders shared outer chrome", async () => {
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
    expect(findLayoutNodesByPrefix(layout, "axis_")).toHaveLength(4);
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
 * @returns {import("../spec/view.js").FacetSpec & {spec: import("../spec/view.js").UnitSpec}}
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

test("horizontal header reservations follow replacement category text", async ({
    onTestFinished,
}) => {
    const view = await createAndInitialize(
        {
            data: { values: [{ g: "A" }] },
            facet: {
                row: { field: "g", header: { angle: 0, align: "right" } },
            },
            spec: { width: 100, height: 50, mark: "point" },
        },
        FacetView
    );
    onTestFinished(() => view.disposeSubtree());
    const initialWidth = view.getSize().width.px;
    const source =
        /** @type {import("../data/sources/inlineSource.js").default} */ (
            view.flowHandle.dataSource
        );
    source.updateDynamicData([{ g: "A substantially longer category label" }]);
    expect(view.getSize().width.px).toBeGreaterThan(initialWidth);
    renderToLayout(view);
    expect(view.child.coords.width).toBe(100);
    expect(
        Array.from(
            getFacetHeaderViews(view)[0].getCollector().getData(),
            (datum) => datum.text
        )
    ).toEqual(["A substantially longer category label"]);
});
