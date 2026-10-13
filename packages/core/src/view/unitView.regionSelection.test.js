// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { resolveEmbedSelection } from "../paramRuntime/embedParamApi.js";
import { createRegionSelectionOverlay } from "../genomeSpy/regionSelectionOverlay.js";
import Rectangle from "./layout/rectangle.js";
import Point from "./layout/point.js";
import InteractionEvent from "../utils/interaction.js";
import UnitView from "./unitView.js";
import { renderToLayout } from "./testUtils.js";
import { createSvg } from "../rendering/svg/index.js";
import { createViewMutationApi } from "./viewMutationApi.js";
import { createWebGpuMarkConfig } from "../rendering/webgpu/webGpuMarkAdapter.js";
import { createMultiPointSelection } from "../selection/selection.js";
import { createPendingRegionSelection } from "../selection/regionSelection.js";

/** @type {import("./view.js").default[]} */
const roots = [];
afterEach(() => {
    roots.splice(0).forEach((root) => root.disposeSubtree());
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

/** @param {boolean} [zoom] @param {import("../spec/root.js").RootSpec} [spec] */
async function setup(zoom = false, spec) {
    const container = document.createElement("div");
    document.body.append(container);
    const { view: root, context } = await createHeadlessEngine(
        spec ?? {
            name: "points",
            params: [{ name: "lasso", select: "region", persist: false }],
            datasets: {
                cells: [
                    { name: "A", x: 10, y: 16 },
                    { name: "B", x: 10, y: 36 },
                    { name: "C", x: 10, y: 25 },
                ],
            },
            data: { name: "cells" },
            mark: { type: "point", tooltip: null },
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { type: "log", domain: [1, 100], zero: false, zoom },
                },
                y: {
                    field: "y",
                    type: "quantitative",
                    scale: { type: "sqrt", domain: [0, 100], zoom },
                },
                color: {
                    condition: { param: "lasso", value: "orange" },
                    value: "gray",
                },
            },
        }
    );
    context.createRegionSelectionOverlay = () =>
        createRegionSelectionOverlay(container);
    context.suspendHoverTracking = vi.fn();
    context.resumeHoverTracking = vi.fn();
    roots.push(root);
    const view = /** @type {UnitView} */ (
        root
            .getDescendants()
            .find((v) => v instanceof UnitView && v.explicitName === "points")
    );
    renderToLayout(root, Rectangle.create(0, 0, 100, 100));
    /** @param {[number,number][]} points @param {boolean} [shiftKey] */
    function trace(points, shiftKey = false) {
        points = points.map(([x, y]) => [
            view.coords.x + (x / 100) * view.coords.width,
            view.coords.y + (y / 100) * view.coords.height,
        ]);
        const [x, y] = points[0];
        const event = new InteractionEvent(
            new Point(x, y),
            new MouseEvent("mousedown", {
                clientX: x,
                clientY: y,
                button: 0,
                shiftKey,
            })
        );
        view.handleInteraction(event, true);
        for (const [x, y] of points.slice(1))
            document.dispatchEvent(
                new MouseEvent("mousemove", {
                    clientX: x,
                    clientY: y,
                    shiftKey,
                })
            );
        return () =>
            document.dispatchEvent(
                new MouseEvent("mouseup", { clientX: x, clientY: y, shiftKey })
            );
    }
    return {
        root,
        view,
        container,
        trace,
        /** @param {[number,number][]} points @param {boolean} [shiftKey] */
        draw: (points, shiftKey) => trace(points, shiftKey)(),
        api: /** @type {import("../types/embedApi.js").RegionSelectionApi} */ (
            resolveEmbedSelection(view, "lasso")
        ),
    };
}

describe("native region selection", () => {
    test("density release at a new corner commits and an inner lasso replaces it", async () => {
        const { root, view, draw, trace, api } = await setup(false, {
            name: "points",
            params: [
                {
                    name: "lasso",
                    select: { type: "region", preview: "density" },
                },
            ],
            data: {
                values: [
                    { name: "A", x: 0.25, y: 0.25 },
                    { name: "B", x: 0.75, y: 0.75 },
                ],
            },
            mark: { type: "point", tooltip: null },
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    axis: null,
                    scale: { domain: [0, 1] },
                },
                y: {
                    field: "y",
                    type: "quantitative",
                    axis: null,
                    scale: { domain: [0, 1] },
                },
            },
        });
        const rows = Array.from(view.getCollector().getData());
        const preview = {
            update: vi.fn(),
            stop: vi.fn(),
            commit: vi.fn(),
            readIds: vi
                .fn()
                .mockResolvedValueOnce({
                    ids: new Uint32Array(rows.map((row) => row.__uniqueId)),
                    indices: new Uint32Array([0, 1]),
                })
                .mockResolvedValueOnce({
                    ids: new Uint32Array([rows[0].__uniqueId]),
                    indices: new Uint32Array([0]),
                }),
        };
        root.context.createRegionSelectionMaterializer = vi.fn(() => preview);
        // Release returns to the initial corner, away from the final mousemove.
        draw([
            [10, 90],
            [90, 90],
            [90, 10],
            [10, 10],
        ]);
        await Promise.resolve();
        expect(api.getValue().data.map((row) => row.name)).toEqual(["A", "B"]);
        draw([
            [20, 80],
            [35, 80],
            [35, 65],
            [20, 65],
        ]);
        await Promise.resolve();
        expect(api.getValue().data.map((row) => row.name)).toEqual(["A"]);
        expect(preview.stop).toHaveBeenCalled();

        const release = trace([
            [21, 79],
            [34, 79],
            [34, 66],
        ]);
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        release();
        expect(api.getValue().data.map((row) => row.name)).toEqual(["A"]);
    });

    test("replaying JSON intent rebuilds current IDs in the captured projection after navigation", async () => {
        const { root, view, draw, api } = await setup(true);
        draw(
            [
                [1, 99],
                [100, 100],
                [0, 0],
            ],
            true
        );
        const saved = JSON.parse(JSON.stringify(api.getValue().intent));
        const previousIds = Array.from(
            view.paramRuntime.getValue("lasso").data.keys()
        );
        api.clear();
        view.getScaleResolution("x").getScale().domain([1, 1000]);
        view.getScaleResolution("y").getScale().domain([0, 400]);
        renderToLayout(root, Rectangle.create(0, 0, 400, 200));
        root.context.dataFlow
            .findNamedDataSource("cells")
            .dataSource.updateDynamicData([
                { name: "B", x: 10, y: 36 },
                { name: "C", x: 10, y: 25 },
                { name: "A", x: 10, y: 16 },
            ]);
        view.paramRuntime.setValue(
            "lasso",
            createPendingRegionSelection(saved)
        );
        await root.paramRuntime.whenPropagated();
        expect(api.getValue()).toMatchObject({
            status: "ready",
            active: true,
            intent: saved,
        });
        expect(
            api
                .getValue()
                .data.map((row) => row.name)
                .sort()
        ).toEqual(["A", "C"]);
        expect(
            Array.from(view.paramRuntime.getValue("lasso").data.keys())
        ).not.toEqual(previousIds);
    });

    test.each([false, true])(
        "pending replay waits for producer completion and respects clear=%s",
        async (clear) => {
            const { root, view, draw, api } = await setup();
            draw([
                [1, 99],
                [100, 100],
                [0, 0],
            ]);
            const saved = api.getValue().intent;
            // An eager reload resets the collector before publishing its replacement rows.
            view.getCollector().reset();
            view.paramRuntime.setValue(
                "lasso",
                createPendingRegionSelection(saved)
            );
            await root.paramRuntime.whenPropagated();
            expect(api.getValue()).toMatchObject({
                status: "pending",
                active: true,
                data: [],
            });
            if (clear) api.clear();
            root.context.dataFlow
                .findNamedDataSource("cells")
                .dataSource.updateDynamicData([
                    { name: "replacement", x: 10, y: 16 },
                ]);
            await root.paramRuntime.whenPropagated();
            expect(api.getValue().status).toBe(clear ? "cleared" : "ready");
            expect(api.getValue().data.map((row) => row.name)).toEqual(
                clear ? [] : ["replacement"]
            );
        }
    );

    test("replay rejects a saved query with incompatible producer fields", async () => {
        const { view, draw, api } = await setup();
        draw([
            [1, 99],
            [100, 100],
            [0, 0],
        ]);
        const intent = {
            ...api.getValue().intent,
            fields: { x: "otherX", y: "y" },
        };
        expect(() =>
            view.paramRuntime.setValue(
                "lasso",
                createPendingRegionSelection(intent)
            )
        ).toThrow("does not match its producer fields and scope");
        expect(api.getValue().data).toEqual([]);
    });

    test("provisions IDs without picking, commits nonlinear membership, and copies snapshots", async () => {
        const { view, container, draw, api } = await setup();
        expect(view.mark.isPickingParticipant()).toBe(false);
        expect(
            Array.from(
                view.getCollector().getData(),
                (row) => row.__uniqueId
            ).every((id) => id > 0)
        ).toBe(true);
        draw([
            [1, 99],
            [100, 100],
            [0, 0],
        ]);
        const selected = api.getValue();
        expect(selected.type).toBe("region");
        expect(selected.active).toBe(true);
        expect(selected.data.map((row) => row.name)).toEqual(["A", "C"]);
        expect(selected.data[0]).not.toHaveProperty("__uniqueId");
        Reflect.set(selected.intent.polygon[0], "0", 99);
        expect(api.getValue().intent.polygon[0][0]).toBeCloseTo(0.01);
        expect(container.querySelector("path").getAttribute("d")).toBe("");
        api.clear();
        expect(api.getValue()).toMatchObject({
            status: "cleared",
            active: false,
            intent: null,
            data: [],
        });
        view.disposeSubtree();
        expect(container.querySelector("svg")).toBeNull();
    });
    test("a zero-match query stays active across unchanged-data replay", async () => {
        const { view, draw, api } = await setup();
        draw([
            [80, 20],
            [100, 20],
            [100, 0],
            [80, 0],
        ]);
        expect(api.getValue()).toMatchObject({
            status: "ready",
            active: true,
            data: [],
        });
        view.getCollector().repropagate();
        expect(api.getValue()).toMatchObject({
            status: "ready",
            active: true,
            data: [],
        });
    });
    test("zoomable plots reserve unmodified drag for navigation", async () => {
        const { draw, api } = await setup(true);
        /** @type {[number,number][]} */
        const triangle = [
            [1, 99],
            [100, 100],
            [0, 0],
        ];
        draw(triangle);
        expect(api.getValue().active).toBe(false);
        draw(triangle, true);
        expect(api.getValue().data.map((row) => row.name)).toEqual(["A", "C"]);
    });
});

/** A shared population, differently projected link, and selection-filtered consumer. */
/** @param {boolean} [expressionFilter] */
async function setupLinked(expressionFilter = false) {
    return setup(false, {
        datasets: {
            cells: [
                { name: "A", x: 10, y: 16 },
                { name: "B", x: 10, y: 36 },
                { name: "C", x: 10, y: 25 },
            ],
        },
        data: { name: "cells" },
        transform: [{ type: "identifier" }],
        params: [
            { name: "lasso", select: "region", persist: false },
            { name: "picked", select: "point", persist: false },
        ],
        resolve: { scale: { x: "independent", y: "independent" } },
        encoding: {
            x: {
                field: "x",
                type: "quantitative",
                axis: null,
                scale: { type: "log", domain: [1, 100], zero: false },
            },
            y: {
                field: "y",
                type: "quantitative",
                axis: null,
                scale: { type: "sqrt", domain: [0, 100], zoom: false },
            },
            color: {
                condition: {
                    test: { param: { or: ["lasso", "picked"] }, empty: false },
                    value: "#f97316",
                },
                value: "#64748b",
            },
        },
        hconcat: [
            { name: "points", mark: { type: "point", tooltip: null } },
            {
                name: "linked",
                mark: { type: "point", tooltip: null },
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: { domain: [0, 100], zoom: false },
                    },
                    y: {
                        field: "y",
                        type: "quantitative",
                        scale: { domain: [0, 100], zoom: false },
                    },
                },
            },
            {
                name: "filtered",
                mark: { type: "point", tooltip: null },
                transform: [
                    expressionFilter
                        ? {
                              type: "filter",
                              expr: "mapHasKey(lasso.data, datum.__uniqueId)",
                          }
                        : { type: "filter", param: "lasso", empty: false },
                ],
            },
        ],
    });
}

/** @param {ReturnType<typeof createSvg>["svg"]} svg @param {string} viewName */
function fills(svg, viewName) {
    return Array.from(
        svg.querySelectorAll(`[data-name="${viewName}"] [fill]`),
        (node) => node.getAttribute("fill")
    );
}

test.each([false, true])(
    "linked plots and SVG preserve region membership (expression filter=%s)",
    async (expressionFilter) => {
        const { root, view, draw, api } = await setupLinked(expressionFilter);
        draw([
            [1, 99],
            [100, 100],
            [0, 0],
        ]);
        await root.paramRuntime.whenPropagated();
        const filtered = /** @type {UnitView} */ (
            root.getDescendants().find((v) => v.explicitName === "filtered")
        );
        expect(
            Array.from(filtered.getCollector().getData(), (d) => d.name)
        ).toEqual(["A", "C"]);
        const selected = Array.from(view.getCollector().getData()).filter((d) =>
            api.getValue().data.some((row) => row.name === d.name)
        );
        expect(
            Array.from(filtered.getCollector().getData(), (d) => d.__uniqueId)
        ).toEqual(selected.map((d) => d.__uniqueId));
        const { svg, warnings } = createSvg({
            viewRoot: root,
            logicalWidth: 900,
            logicalHeight: 300,
        });
        expect(warnings).toEqual([]);
        expect(fills(svg, "points")).toEqual(["#f97316", "#64748b", "#f97316"]);
        expect(fills(svg, "linked")).toEqual(fills(svg, "points"));
        expect(fills(svg, "filtered")).toEqual(["#f97316", "#f97316"]);
        // A ready sibling still contributes membership when the lasso has no matches.
        root.paramRuntime.setValue(
            "picked",
            createMultiPointSelection([
                Array.from(view.getCollector().getData())[1],
            ])
        );
        draw([
            [80, 20],
            [99, 20],
            [99, 1],
            [80, 1],
        ]);
        await root.paramRuntime.whenPropagated();
        expect(api.getValue()).toMatchObject({ active: true, data: [] });
        expect(filtered.getCollector().getItemCount()).toBe(0);
        expect(
            fills(
                createSvg({
                    viewRoot: root,
                    logicalWidth: 900,
                    logicalHeight: 300,
                }).svg,
                "linked"
            )
        ).toEqual(["#64748b", "#f97316", "#64748b"]);
        api.clear();
        await root.paramRuntime.whenPropagated();
        expect(api.getValue().active).toBe(false);
    }
);

test("clearing during a drag cancels its publication and removes the outline", async () => {
    const { trace, api, container } = await setup();
    const release = trace([
        [1, 99],
        [99, 99],
        [1, 1],
    ]);
    expect(container.querySelector("path").getAttribute("d")).not.toBe("");
    api.clear();
    release();
    expect(api.getValue()).toMatchObject({ status: "cleared", data: [] });
    expect(container.querySelector("path").getAttribute("d")).toBe("");
});

test("removing the producer clears shared membership without disposing the linked consumer", async () => {
    const { root, draw, api } = await setupLinked();
    draw([
        [1, 99],
        [99, 99],
        [1, 1],
    ]);
    expect(api.getValue().active).toBe(true);
    await createViewMutationApi({ viewRoot: root }).remove({
        scope: [],
        view: "points",
    });
    await root.paramRuntime.whenPropagated();
    expect(api.getValue()).toMatchObject({
        status: "cleared",
        active: false,
        data: [],
    });
    const filtered = /** @type {UnitView} */ (
        root.getDescendants().find((v) => v.explicitName === "filtered")
    );
    expect(filtered.getCollector().getItemCount()).toBe(0);
});

test("producer data publication cancels an unfinished gesture", async () => {
    const { root, trace, api, container } = await setupLinked();
    const release = trace([
        [1, 99],
        [99, 99],
        [1, 1],
    ]);
    root.context.dataFlow
        .findNamedDataSource("cells")
        .dataSource.updateDynamicData([{ name: "replacement", x: 20, y: 30 }]);
    expect(container.querySelector("path").getAttribute("d")).toBe("");
    release();
    expect(api.getValue().active).toBe(false);
});

test("removing a filtered consumer releases its cached input and keeps the producer selection", async () => {
    const { root, draw, api } = await setupLinked();
    draw([
        [1, 99],
        [99, 99],
        [1, 1],
    ]);
    await root.paramRuntime.whenPropagated();
    const before = root.context.dataFlow.collectors.length;
    await createViewMutationApi({ viewRoot: root }).remove({
        scope: [],
        view: "filtered",
    });
    expect(root.context.dataFlow.collectors.length).toBe(before - 2);
    expect(api.getValue().active).toBe(true);
});

test.each(["filter", "formula"])(
    "computed aliases preserve lasso state through a %s consumer",
    async (kind) => {
        const { root, draw, api } = await setup(false, {
            data: {
                values: [
                    { x: 10, y: 16 },
                    { x: 10, y: 36 },
                    { x: 10, y: 25 },
                ],
            },
            transform: [{ type: "identifier" }],
            params: [
                { name: "lasso", select: "region", persist: false },
                { name: "alias", expr: "lasso" },
                { name: "alias2", expr: "alias" },
            ],
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    axis: null,
                    scale: {
                        type: "log",
                        domain: [1, 100],
                        zero: false,
                        zoom: false,
                    },
                },
                y: {
                    field: "y",
                    type: "quantitative",
                    axis: null,
                    scale: { type: "sqrt", domain: [0, 100], zoom: false },
                },
            },
            hconcat: [
                { name: "points", mark: { type: "point", tooltip: null } },
                {
                    name: "consumer",
                    mark: { type: "point", tooltip: null },
                    transform: [
                        kind === "filter"
                            ? {
                                  type: "filter",
                                  expr: "mapHasKey(alias2.data, datum.__uniqueId)",
                              }
                            : {
                                  type: "formula",
                                  as: "selected",
                                  expr: "mapHasKey(alias2.data, datum.__uniqueId)",
                              },
                    ],
                },
            ],
        });
        draw([
            [1, 99],
            [100, 100],
            [0, 0],
        ]);
        await root.paramRuntime.whenPropagated();
        expect(api.getValue()).toMatchObject({ status: "ready", active: true });
        expect(api.getValue().data).toHaveLength(2);
        const consumer = /** @type {UnitView} */ (
            root.getDescendants().find((v) => v.explicitName === "consumer")
        );
        if (kind === "filter")
            expect(consumer.getCollector().getItemCount()).toBe(2);
        else
            expect(
                Array.from(consumer.getCollector().getData(), (d) => d.selected)
            ).toEqual([true, false, true]);
    }
);

test("pushed region selections invalidate the ancestor value on data replacement and removal", async () => {
    const { root, draw, api } = await setup(false, {
        datasets: {
            cells: [
                { x: 10, y: 16 },
                { x: 10, y: 25 },
            ],
        },
        data: { name: "cells" },
        params: [{ name: "lasso", value: null, persist: false }],
        layer: [
            {
                name: "points",
                params: [
                    {
                        name: "lasso",
                        select: "region",
                        push: "outer",
                        persist: false,
                    },
                ],
                mark: { type: "point", tooltip: null },
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        axis: null,
                        scale: { domain: [0, 100], zoom: false },
                    },
                    y: {
                        field: "y",
                        type: "quantitative",
                        axis: null,
                        scale: { domain: [0, 100], zoom: false },
                    },
                },
            },
        ],
    });
    const polygon = /** @type {[number,number][]} */ ([
        [1, 99],
        [99, 99],
        [1, 1],
    ]);
    draw(polygon);
    await root.paramRuntime.whenPropagated();
    expect(api.getValue().active).toBe(true);
    root.context.dataFlow
        .findNamedDataSource("cells")
        .dataSource.updateDynamicData([{ x: 10, y: 16 }]);
    await root.paramRuntime.whenPropagated();
    expect(api.getValue().active).toBe(false);
    draw(polygon);
    await root.paramRuntime.whenPropagated();
    expect(api.getValue().active).toBe(true);
    await createViewMutationApi({ viewRoot: root }).remove({
        scope: [],
        view: "points",
    });
    expect(root.paramRuntime.getValue("lasso").status).toBe("cleared");
});

test("aliased self-filtering producers are rejected before interaction", async () => {
    await expect(
        createHeadlessEngine(
            {
                name: "points",
                data: { values: [{ x: 1, y: 1 }] },
                params: [
                    { name: "lasso", select: "region" },
                    { name: "alias", expr: "lasso" },
                ],
                transform: [
                    {
                        type: "filter",
                        expr: "mapHasKey(alias.data, datum.__uniqueId)",
                    },
                ],
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    y: { field: "y", type: "quantitative" },
                },
            },
            { onDataFlowBuilt: (flow) => roots.push(flow.dataSources[0].view) }
        )
    ).rejects.toThrow(
        "A region producer cannot be filtered by its own selection."
    );
});

test("non-picking backgrounds avoid IDs while conditional non-point consumers receive them", async () => {
    const { view: root } = await createHeadlessEngine({
        data: { values: [{ x: 1, y: 1 }] },
        transform: [{ type: "identifier" }],
        params: [{ name: "lasso", select: "region", persist: false }],
        layer: [
            {
                name: "points",
                mark: { type: "point", tooltip: null },
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    y: { field: "y", type: "quantitative" },
                },
            },
            {
                name: "background",
                data: { values: [{}] },
                mark: { type: "rect", tooltip: null },
                encoding: {
                    fill: { value: "white" },
                    stroke: { value: "black" },
                    x: { value: 0 },
                    y: { value: 0 },
                    x2: { value: 100 },
                    y2: { value: 100 },
                },
            },
            {
                name: "consumer",
                mark: { type: "rule", tooltip: null },
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    color: {
                        condition: {
                            param: "lasso",
                            empty: false,
                            value: "orange",
                        },
                        value: "gray",
                    },
                },
            },
        ],
    });
    roots.push(root);
    const background = /** @type {UnitView} */ (
        root.getDescendants().find((v) => v.explicitName === "background")
    );
    const consumer = /** @type {UnitView} */ (
        root.getDescendants().find((v) => v.explicitName === "consumer")
    );
    expect(background.mark.encoders.uniqueId).toBeUndefined();
    expect(consumer.mark.encoders.uniqueId).toBeDefined();
    const bounds = Rectangle.create(0, 0, 100, 100);
    expect(() =>
        createWebGpuMarkConfig(background.mark, {}, bounds)
    ).not.toThrow();
    expect(() =>
        createWebGpuMarkConfig(consumer.mark, {}, bounds)
    ).not.toThrow();
});

/** Sets up enough rows to cross a confirmation batch, with deterministic frames.
 * @param {boolean} [density] */
async function setupConfirmation(density = false) {
    const result = await setup(false, {
        name: "points",
        params: [
            {
                name: "lasso",
                select: {
                    type: "region",
                    ...(density ? { preview: "density" } : {}),
                },
                persist: false,
            },
        ],
        datasets: {
            cells: Array.from({ length: 600 }, (_, i) => ({
                name: String(i),
                x: i < 300 ? 0.25 : 0.75,
                y: i < 300 ? 0.25 : 0.75,
            })),
        },
        data: { name: "cells" },
        mark: { type: "point", tooltip: null },
        encoding: {
            x: {
                field: "x",
                type: "quantitative",
                scale: { domain: [0, 1], zoom: true },
            },
            y: {
                field: "y",
                type: "quantitative",
                scale: { domain: [0, 1], zoom: true },
            },
        },
    });
    const rows = Array.from(result.view.getCollector().getData()).slice(0, 300);
    const preview = {
        update: vi.fn(),
        stop: vi.fn(),
        commit: vi.fn(),
        readIds: vi.fn(async () => ({
            ids: new Uint32Array(rows.map((row) => row.__uniqueId)),
            indices: Uint32Array.from({ length: rows.length }, (_, i) => i),
        })),
    };
    const createPreview = vi.fn(
        /** @type {NonNullable<import("../types/viewContext.js").default["createRegionSelectionMaterializer"]>} */ (
            () => preview
        )
    );
    if (density)
        result.root.context.createRegionSelectionMaterializer = createPreview;
    const animator = result.root.context.animator;
    vi.spyOn(animator, "requestTransition").mockImplementation((callback) => {
        animator.cancelTransition(callback);
        animator.transitions.push(callback);
    });
    let time = 0;
    vi.spyOn(performance, "now").mockImplementation(() => (time += 10));
    return {
        ...result,
        createPreview,
        frame: () => animator.transitions.shift()?.(0),
        drawLower: () =>
            result.draw(
                [
                    [10, 90],
                    [40, 90],
                    [40, 60],
                    [10, 60],
                ],
                true
            ),
        drawUpper: () =>
            result.draw(
                [
                    [60, 40],
                    [90, 40],
                    [90, 10],
                    [60, 10],
                ],
                true
            ),
    };
}

test("confirmation yields without publishing partial membership and replaces an unfinished lasso", async () => {
    const s = await setupConfirmation();
    s.drawLower();
    expect(s.api.getValue()).toMatchObject({ status: "cleared", data: [] });
    s.drawUpper();
    s.frame();
    expect(s.api.getValue().data).toEqual([]);
    s.frame();
    expect(s.api.getValue().status).toBe("ready");
    expect(s.api.getValue().data).toHaveLength(300);
    expect(s.api.getValue().data.every((row) => row.x === 0.75)).toBe(true);
    s.drawLower();
    expect(s.api.getValue().data.every((row) => row.x === 0.75)).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(s.api.getValue().data.every((row) => row.x === 0.75)).toBe(true);
});

test("wheel zoom and panning wait for confirmation and resume after completion or cancellation", async () => {
    const s = await setupConfirmation();
    const event = (/** @type {"wheel" | "mousedown"} */ type) => {
        const point = new Point(s.view.coords.x + 10, s.view.coords.y + 10);
        const input = new InteractionEvent(
            point,
            new MouseEvent(type, {
                clientX: point.x,
                clientY: point.y,
                button: 0,
            })
        );
        s.view.handleInteraction(input, true);
        return input;
    };
    s.drawLower();
    expect(event("wheel").stopped).toBe(true);
    expect(event("mousedown").stopped).toBe(true);
    s.frame();
    s.frame();
    expect(event("wheel").stopped).toBe(false);
    expect(event("mousedown").stopped).toBe(false);
    s.drawUpper();
    s.api.clear();
    expect(event("wheel").stopped).toBe(false);
});

test("invalidating a density image cancels its confirmation instead of publishing it later", async () => {
    const s = await setupConfirmation(true);
    s.drawLower();
    await Promise.resolve();
    s.frame();
    s.frame();
    const previous = s.api.getValue().intent;
    s.drawUpper();
    await Promise.resolve();
    const queued = s.root.context.animator.transitions[0];
    // Backend invalidation may arrive after document drag cleanup has already run.
    s.createPreview.mock.calls.at(-1)[2]();
    queued(0);
    expect(s.root.context.animator.transitions).toHaveLength(0);
    expect(s.api.getValue().intent).toEqual(previous);
    expect(s.api.getValue().data.every((row) => row.x === 0.25)).toBe(true);
});

test.each(["clear", "escape", "blur", "data", "loading", "dispose"])(
    "%s cancels confirmation before stale membership can be published",
    async (action) => {
        const s = await setupConfirmation();
        s.drawLower();
        const queued = s.root.context.animator.transitions[0];
        switch (action) {
            case "clear":
                s.api.clear();
                break;
            case "escape":
                document.dispatchEvent(
                    new KeyboardEvent("keydown", { key: "Escape" })
                );
                break;
            case "blur":
                window.dispatchEvent(new Event("blur"));
                break;
            case "data":
                s.root.context.dataFlow
                    .findNamedDataSource("cells")
                    .dataSource.updateDynamicData([{ x: 0.25, y: 0.25 }]);
                break;
            case "dispose":
                s.root.disposeSubtree();
                break;
            case "loading":
                // Async reload resets the collector before publishing replacement rows.
                s.view.getCollector().reset();
                s.frame();
                break;
            default:
                throw new Error("Unknown cancellation action.");
        }
        expect(s.root.context.animator.transitions).toHaveLength(0);
        queued(0);
        if (action !== "dispose") expect(s.api.getValue().data).toEqual([]);
    }
);

test("native GPU membership uses returned row indices without running CPU containment", async () => {
    const s = await setupConfirmation();
    const rows = Array.from(s.view.getCollector().getData());
    const materializer = {
        update: vi.fn(),
        stop: vi.fn(),
        commit: vi.fn(),
        readIds: vi.fn(async () => ({
            ids: new Uint32Array([rows[500].__uniqueId]),
            indices: new Uint32Array([500]),
        })),
    };
    s.root.context.createRegionSelectionMaterializer = vi.fn(
        () => materializer
    );
    materializer.stop.mockImplementation(() => {
        expect(
            s.view.paramRuntime.getValue("lasso").data.get(rows[500].__uniqueId)
        ).toBe(rows[500]);
    });
    s.drawLower();
    // Trace cleanup must retain live membership through readback and publication.
    expect(materializer.stop).not.toHaveBeenCalled();
    await Promise.resolve();
    s.frame();
    // This supplied result lies outside the CPU triangle, proving that it is not rescanned.
    expect(
        s.view.paramRuntime.getValue("lasso").data.get(rows[500].__uniqueId)
    ).toBe(rows[500]);
    expect(materializer.commit).toHaveBeenCalledWith(
        s.view.paramRuntime.getValue("lasso")
    );
    expect(materializer.stop).toHaveBeenCalledOnce();
});

test("clearing during GPU readback prevents its later result from publishing", async () => {
    const s = await setupConfirmation();
    const rows = Array.from(s.view.getCollector().getData());
    /** @type {(value: {ids: Uint32Array, indices: Uint32Array}) => void} */
    let resolve;
    const materializer = {
        update: vi.fn(),
        stop: vi.fn(),
        commit: vi.fn(),
        readIds: vi.fn(
            () =>
                new Promise((done) => {
                    resolve = done;
                })
        ),
    };
    s.root.context.createRegionSelectionMaterializer = vi.fn(
        () => materializer
    );
    s.drawLower();
    s.api.clear();
    resolve({
        ids: new Uint32Array([rows[0].__uniqueId]),
        indices: new Uint32Array([0]),
    });
    await Promise.resolve();
    expect(s.root.context.animator.transitions).toHaveLength(0);
    expect(s.api.getValue().status).toBe("cleared");
    expect(materializer.commit).not.toHaveBeenCalled();
});

test("a GPU trace collapsed by sampling cancels without replacing committed membership", async () => {
    const s = await setupConfirmation(true);
    s.drawLower();
    await Promise.resolve();
    s.frame();
    s.frame();
    const previous = s.view.paramRuntime.getValue("lasso");
    const materializer = s.createPreview.mock.results[0].value;
    vi.clearAllMocks();

    // Only vertex 1 leaves the line; the 512-vertex budget samples it away.
    s.draw(
        [
            [10, 90],
            [50, 10],
            ...Array.from(
                { length: 530 },
                (_, i) =>
                    /** @type {[number, number]} */ ([i % 2 ? 90 : 10, 90])
            ),
        ],
        true
    );
    expect(s.view.paramRuntime.getValue("lasso")).toBe(previous);
    expect(materializer.stop).toHaveBeenCalledOnce();
    expect(materializer.readIds).not.toHaveBeenCalled();
    expect(materializer.commit).not.toHaveBeenCalled();
    expect(s.root.context.animator.transitions).toHaveLength(0);
});
