import { expect, onTestFinished, test, vi } from "vitest";
import {
    create,
    createAndInitialize,
    createBroadcastingTestViewContext,
    renderToLayout,
} from "./testUtils.js";
import FacetView from "./facetView.js";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import ConcatView from "./concatView.js";
import UnitView from "./unitView.js";
import { isChromeView, visitAddressableViews } from "./viewSelectors.js";
import { calculateCanvasSize } from "./viewUtils.js";
import {
    initializeViewSubtree,
    loadViewSubtreeData,
} from "../data/flowInit.js";
import {
    createFacetGrid,
    getFacetCellLayouts,
    getFacetGridSize,
} from "./facetLayout.js";
import { FlexDimensions } from "./layout/flexLayout.js";
import Padding from "./layout/padding.js";
import Rectangle from "./layout/rectangle.js";
import DebuggingViewRenderingContext from "./renderingContext/debuggingViewRenderingContext.js";

/** @param {Partial<import("../spec/view.js").FacetSpec>} [overrides]
 * @returns {import("../spec/view.js").FacetSpec} */
function spec(overrides = {}) {
    return {
        data: { values: ["C", "B", "A"].map((g) => ({ g })) },
        facet: { field: "g" },
        columns: 2,
        spec: { name: "points", width: 100, height: 50, mark: "point" },
        ...overrides,
    };
}

/** @param {Partial<import("../spec/view.js").FacetSpec>} [overrides] */
async function initialize(overrides = {}) {
    const view = await createAndInitialize(spec(overrides), FacetView);
    onTestFinished(() => view.disposeSubtree());
    return view;
}

/** @param {FacetView} view */
function source(view) {
    return /** @type {import("../data/sources/inlineSource.js").default} */ (
        view.flowHandle.dataSource
    );
}

/** @param {FacetView} view */
function headers(view) {
    return view
        .getDescendants()
        .filter((v) => v instanceof UnitView)
        .filter((v) => v.name.startsWith("facetHeader"));
}

// Exercise validation at the spec boundary, without constructing a dataflow for rejected specs.
test.each(
    /** @type {[any, RegExp][]} */ ([
        ...[0, -1, 1.5, Infinity].map((columns) => [
            { columns },
            /positive integer/,
        ]),
        [{ facet: { row: { field: "g" } } }, /one-dimensional column/],
        ...[{ field: "x" }, ["A", null], [Infinity]].map((sort) => [
            { facet: { field: "g", sort } },
            /Facet sort must/,
        ]),
        ...[
            null,
            [null],
            [Infinity],
            { field: "x" },
            { expr: "'oops'" },
            { expr: "undefined" },
        ].map((domain) => [
            { facet: { field: "g", domain } },
            /Facet domain must/,
        ]),
        ...[false, { labels: "false" }, { title: "Group" }, { format: 1 }].map(
            (header) => [{ facet: { field: "g", header } }, /Facet header must/]
        ),
        [
            { facet: { field: "g", header: { format: "invalid" } } },
            /invalid format/,
        ],
        ...[-1, "10", { row: NaN }, { extra: 10 }].map((spacing) => [
            { spacing },
            /Facet spacing must/,
        ]),
        ...["viewportWidth", "viewportHeight"].map((viewport) => [
            { spec: { layer: [{ mark: "point", [viewport]: 60 }] } },
            /Set the viewport on the facet/,
        ]),
        [
            { spec: { facet: { field: "g" }, spec: { mark: "point" } } },
            /immediate facet child/,
        ],
        [
            {
                templates: {
                    inner: {
                        vconcat: [
                            { facet: { field: "g" }, spec: { mark: "point" } },
                        ],
                    },
                },
                spec: { import: { template: "inner" } },
            },
            /must import unit, layer, or multiscale/,
        ],
    ])
)("rejects invalid facet configuration %j", async (overrides, error) => {
    await expect(create(spec(overrides), FacetView)).rejects.toThrow(error);
});

test.each(
    /** @type {const} */ ([
        ["scale", "x", "facet"],
        ["axis", "y", "facet"],
        ["scale", "x", "unit"],
        ["axis", "x", "unit"],
        ["axis", "x", "layer"],
        ["scale", "color", "facet"],
        ["legend", "color", "facet"],
        ["scale", "size", "facet"],
        ["legend", "default", "facet"],
    ])
)("rejects independent %s.%s on %s", async (type, channel, owner) => {
    const resolve = { [type]: { [channel]: "independent" } };
    if (type === "scale" && channel === "x")
        resolve.axis = { x: "independent" };
    const points = {
        mark: "point",
        encoding: { x: { field: "x", type: "quantitative" } },
    };
    await expect(
        create(
            spec(
                /** @type {any} */ ({
                    resolve: owner === "facet" ? resolve : undefined,
                    spec:
                        owner === "layer"
                            ? { resolve, layer: [points] }
                            : {
                                  ...points,
                                  resolve:
                                      owner === "unit" ? resolve : undefined,
                              },
                })
            ),
            FacetView
        )
    ).rejects.toThrow(/supports only shared/);
});

test.each(
    /** @type {import("../spec/view.js").ViewSpec[]} */ ([
        { mark: "point" },
        { layer: [{ mark: "point" }] },
        { multiscale: [{ mark: "point" }], stops: [] },
    ])
)("imports supported child plots %j", async (plot) => {
    const view = await initialize({
        templates: { plot },
        spec: { import: { template: "plot" } },
    });
    const points = /** @type {UnitView} */ (
        view.child.getDescendants().find((v) => v instanceof UnitView)
    );
    expect(
        Array.from(points.getCollector().facetBatches.keys()).filter(Boolean)
    ).toEqual([["C"], ["B"], ["A"]]);
});

test.each(
    /** @type {Array<[Partial<import("../spec/channel.js").FacetFieldDef>, string[]]>} */ ([
        [{}, ["A", "B", "C"]],
        [{ sort: "descending" }, ["C", "B", "A"]],
        [{ sort: ["B", "absent", "B"] }, ["B", "C", "A"]],
        [{ sort: [] }, ["C", "B", "A"]],
        [{ domain: ["B", "A", "empty", "B"] }, ["B", "A", "empty"]],
        [
            { domain: ["B", "A", "empty"], sort: "ascending" },
            ["A", "B", "empty"],
        ],
        [
            { domain: ["B", "A", "empty"], sort: ["empty", "C"] },
            ["empty", "B", "A"],
        ],
        [{ domain: [] }, []],
    ])
)(
    "domain/sort %j determines cells and category labels",
    async (field, expected) => {
        const view = await initialize({ facet: { field: "g", ...field } });
        renderToLayout(view);
        expect(Array.from(view.child.facetCoords.keys())).toEqual(
            expected.map((g) => [g])
        );
        expect(
            Array.from(headers(view)[0].getCollector().getData(), (d) => d.text)
        ).toEqual(expected);
    }
);

test("expression domains update matrix membership independently of data", async () => {
    const view = await initialize({
        data: { values: [] },
        params: [{ name: "rows", value: ["B", "A"] }],
        columns: undefined,
        facet: {
            row: { field: "r", domain: { expr: "rows" } },
            column: { field: "c", domain: [2, 1] },
        },
    });
    renderToLayout(view);
    expect(Array.from(view.child.facetCoords.keys())).toEqual([
        ["B", 2],
        ["B", 1],
        ["A", 2],
        ["A", 1],
    ]);
    const reflow = vi.spyOn(view.context, "requestLayoutReflow");
    view.paramRuntime.setValue("rows", ["A", "C"]);
    await view.paramRuntime.whenPropagated();
    expect(reflow).toHaveBeenCalledOnce();
    renderToLayout(view);
    expect(Array.from(view.child.facetCoords.keys())).toEqual([
        ["A", 2],
        ["A", 1],
        ["C", 2],
        ["C", 1],
    ]);
    expect(
        Array.from(headers(view)[1].getCollector().getData(), (d) => d.text)
    ).toEqual(["A", "C"]);
    reflow.mockClear();
    view.paramRuntime.setValue("rows", ["A", "C"]);
    await view.paramRuntime.whenPropagated();
    expect(reflow).not.toHaveBeenCalled();
});

test("matrix updates retain empty combinations and reflow only for changed factors", async () => {
    const data = [
        { r: "A", c: 2 },
        { r: "B", c: 3 },
        { r: "A", c: 1 },
    ];
    const view = await initialize({
        data: { values: data },
        columns: undefined,
        facet: {
            row: { field: "r", sort: "descending" },
            column: { field: "c", sort: [1] },
        },
    });
    renderToLayout(view);
    expect(Array.from(view.child.facetCoords.keys())).toEqual([
        ["B", 1],
        ["B", 2],
        ["B", 3],
        ["A", 1],
        ["A", 2],
        ["A", 3],
    ]);
    const initial = view.getSize();
    const reflow = vi.spyOn(view.context, "requestLayoutReflow");
    source(view).updateDynamicData([...data, { r: "B", c: 1 }]);
    expect(view.getSize()).toEqual(initial);
    expect(reflow).not.toHaveBeenCalled();
    source(view).updateDynamicData([
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
    expect(reflow).toHaveBeenCalled();
});

test("headers are chrome and horizontal label reservations follow replacement data", async () => {
    const view = await initialize({
        columns: undefined,
        facet: { row: { field: "g", header: { angle: 0, align: "right" } } },
    });
    const [header] = headers(view);
    /** @type {import("./view.js").default[]} */
    const addressable = [];
    visitAddressableViews(view, (v) => {
        addressable.push(v);
    });
    expect(isChromeView(header)).toBe(true);
    expect(addressable).not.toContain(header);
    renderToLayout(view);
    const width = view.getSize().width.px;
    source(view).updateDynamicData([
        { g: "A substantially longer category label" },
    ]);
    expect(view.getSize().width.px).toBeGreaterThan(width);
    renderToLayout(view);
    expect(view.child.coords.width).toBe(100);
    expect(Array.from(header.getCollector().getData(), (d) => d.text)).toEqual([
        "A substantially longer category label",
    ]);
});

test("layer color scales stay independent while their facet cells share them", async () => {
    const view = await initialize({
        data: {
            values: [
                { g: "A", a: "red", b: "small" },
                { g: "B", a: "blue", b: "large" },
            ],
        },
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
    });
    const [a, b] = /** @type {import("./layerView.js").default} */ (
        view.child
    ).children.map((v) => v.getScaleResolution("color"));
    expect(a).not.toBe(b);
    expect(a.getDomain()).toEqual(["red", "blue"]);
    expect(b.getDomain()).toEqual(["small", "large"]);
});

test.each([false, true])(
    "root sizing works before data initialization (flexible: %s)",
    async (flexible) => {
        const root = await create(
            spec({
                spec: {
                    mark: "point",
                    ...(flexible ? {} : { width: 100, height: 50 }),
                },
            }),
            ConcatView,
            { wrapRoot: true }
        );
        onTestFinished(() => root.disposeSubtree());
        expect(root.children[0]).toBeInstanceOf(FacetView);
        expect(root.getSize().isGrowing()).toBe(flexible);
        if (flexible)
            expect(calculateCanvasSize(root)).toEqual({
                width: undefined,
                height: undefined,
            });
        else expect(root.getSize().height.px).toBe(22);
        const { dataSources } = initializeViewSubtree(
            root,
            root.context.dataFlow
        );
        await loadViewSubtreeData(root, dataSources);
        expect(root.children[0].getSize().isGrowing()).toBe(flexible);
        if (flexible)
            expect(calculateCanvasSize(root)).toEqual({
                width: undefined,
                height: undefined,
            });
        else {
            expect(root.children[0].getSize().height.px).toBe(188);
            expect(root.getSize().height.px).toBe(188);
        }
    }
);

test("scrolling partly clipped cells keeps axis lengths and tick labels stable", async () => {
    const context = createBroadcastingTestViewContext();
    const { view: root } = await createHeadlessEngine(
        spec({
            columns: undefined,
            viewportHeight: 20,
            spacing: 4,
            facet: { row: { field: "g", header: null, title: null } },
            spec: {
                width: 100,
                height: 30,
                mark: "point",
                encoding: {
                    y: {
                        datum: 0,
                        type: "quantitative",
                        scale: { domain: [-1, 1], nice: false },
                        axis: {
                            values: [-1, 1],
                            title: null,
                            labelFlush: true,
                        },
                    },
                },
            },
        }),
        { context }
    );
    onTestFinished(() => root.disposeSubtree());
    const facet = /** @type {FacetView} */ (
        root.getDescendants().find((v) => v instanceof FacetView)
    );
    const scrollbar = /** @type {import("./gridView/scrollbar.js").default} */ (
        root.getDescendants().find((v) => v.name === "scrollbar-vertical")
    );
    const labels = /** @type {UnitView} */ (
        root.getDescendants().find((v) => v.name === "labels_main")
    );
    expect(facet.getSize().height.px).toBe(98);
    expect(root.getSize().height.px).toBe(20);
    renderToLayout(root);
    context.emitBroadcast(root, "layoutComputed");
    await root.paramRuntime.whenPropagated();
    const reflow = vi.spyOn(context, "requestLayoutReflow");

    // Every visible cell is clipped; the leading cell shrinks to 4px, then scrolls out.
    for (const offset of [0, 26, 34]) {
        scrollbar.setViewportOffset(offset);
        expect(facet.child.getScaleResolution("y").getAxisLength()).toBe(30);
        expect(
            Array.from(labels.getCollector().getData(), (d) => d.label)
        ).toEqual(["−1", "1"]);
    }
    expect(reflow).not.toHaveBeenCalled();
});

test("flex constraints cap plot sizes while preserving guide reservations", () => {
    const grid = createFacetGrid(
        { row: undefined, column: { field: "g" }, fields: ["g"] },
        { row: [], column: ["A", "B"] },
        undefined
    );
    const childSize = new FlexDimensions(
        { px: 100, grow: 1, minPx: 120, maxPx: 200 },
        { px: 80, grow: 0 }
    );
    const overhang = new Padding(0, 10, 0, 10);
    const bands = { row: Padding.zero(), column: Padding.zero() };
    expect(
        getFacetGridSize(grid, childSize, () => overhang, bands).width
    ).toMatchObject({ px: 240, grow: 2, minPx: 280, maxPx: 440 });
    const layouts = getFacetCellLayouts(
        grid,
        Rectangle.create(0, 0, 1000, 98),
        childSize,
        () => overhang,
        bands
    );
    expect(layouts.map((cell) => cell.childCoords.width)).toEqual([200, 200]);
});

test.each([
    { clipX: true, clipY: true, visible: ["A"] },
    { clipX: false, clipY: true, visible: ["A", "B"] },
    { clipX: true, clipY: false, visible: ["A", "C"] },
])(
    "cell hit bounds respect clipping directions $clipX/$clipY",
    async ({ clipX, clipY, visible }) => {
        const view = await initialize();
        view.arrange(
            new DebuggingViewRenderingContext({}),
            Rectangle.create(0, 0, 210, 188),
            {
                firstFacet: true,
                clip: { rect: Rectangle.create(0, 0, 100, 80), clipX, clipY },
            }
        );
        expect(
            Array.from(view.child.facetCoords.entries())
                .filter(([, coords]) => coords.width > 0 && coords.height > 0)
                .map(([id]) => id[0])
        ).toEqual(visible);
    }
);
