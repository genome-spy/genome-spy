// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { ActionCreators } from "redux-undo";
import { createHeadlessEngine } from "@genome-spy/core/genomeSpy/headlessBootstrap.js";
import { createViewMutationApi } from "@genome-spy/core/view/viewMutationApi.js";
import { getRegionProjection } from "@genome-spy/core/selection/regionProjection.js";
import {
    isDataReady,
    iterateDataDependencies,
} from "@genome-spy/core/data/dataReadiness.js";
import {
    createPendingRegionSelection,
    materializeRegionSelectionForView,
} from "@genome-spy/core/selection/regionSelection.js";
import { createProvenanceReducer } from "./provenanceReducerBuilder.js";
import {
    getParamChangeGroupKey,
    paramProvenanceSlice,
} from "./paramProvenanceSlice.js";
import ParamProvenanceBridge from "./paramProvenanceBridge.js";
import IntentExecutor from "./intentExecutor.js";
import {
    getParamSelector,
    makeParamSelectorKey,
} from "@genome-spy/core/view/viewSelectors.js";
import { getParamActionInfo } from "./paramActionInfo.js";
import templateResultToString from "../utils/templateResultToString.js";

vi.mock("../components/generic/messageDialog.js", () => ({
    showMessageDialog: vi.fn(),
}));

const cells = [
    { name: "A", x: 10, y: 16 },
    { name: "B", x: 10, y: 36 },
    { name: "C", x: 10, y: 25 },
];
const selector = { scope: [], param: "lasso" };
const key = makeParamSelectorKey(selector);
/** @type {{root: import("@genome-spy/core/view/view.js").default, bridge: ParamProvenanceBridge}[]} */
const worlds = [];
afterEach(() => {
    for (const { root, bridge } of worlds.splice(0)) {
        bridge.dispose();
        root.disposeSubtree();
    }
    vi.useRealTimers();
    vi.clearAllMocks();
});

/** @param {typeof cells} [rows] @param {boolean} [pushed] @param {boolean} [lookup] */
async function setup(rows = cells, pushed = false, lookup = false) {
    const { view: root } = await createHeadlessEngine({
        datasets: {
            cells: rows,
            foreign: cells.map((row) => ({ name: row.name, score: 3 })),
        },
        data: { name: "cells" },
        transform: [{ type: "identifier" }],
        params: [
            pushed
                ? { name: "lasso", value: null }
                : { name: "lasso", select: "region" },
            { name: "showA", value: true, bind: { input: "checkbox" } },
        ],
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
                scale: { type: "sqrt", domain: [0, 100] },
            },
            color: {
                condition: { param: "lasso", empty: false, value: "orange" },
                value: "gray",
            },
        },
        hconcat: [
            {
                name: "points",
                mark: { type: "point", tooltip: null },
                params: pushed
                    ? [{ name: "lasso", select: "region", push: "outer" }]
                    : [],
                transform: [
                    { type: "filter", expr: "showA || datum.name !== 'A'" },
                    ...(lookup
                        ? [
                              {
                                  type: "lookup",
                                  from: { name: "foreign" },
                                  key: "name",
                                  values: ["score"],
                              },
                          ]
                        : []),
                ],
            },
            {
                name: "filtered",
                mark: { type: "point", tooltip: null },
                transform: [{ type: "filter", param: "lasso", empty: false }],
            },
        ],
    });
    const producer =
        /** @type {import("@genome-spy/core/view/unitView.js").default} */ (
            root.getDescendants().find((view) => view.explicitName === "points")
        );
    const filtered =
        /** @type {import("@genome-spy/core/view/unitView.js").default} */ (
            root
                .getDescendants()
                .find((view) => view.explicitName === "filtered")
        );
    const paramView = pushed ? producer : root;
    const selector = getParamSelector(paramView, "lasso");
    const store = configureStore({
        reducer: {
            provenance: createProvenanceReducer(
                { paramProvenance: paramProvenanceSlice.reducer },
                { groupBy: getParamChangeGroupKey }
            ),
        },
    });
    // Establish the initial scene before recording user selection actions.
    store.dispatch(
        paramProvenanceSlice.actions.paramChange({
            selector,
            value: { type: "region", intent: null },
        })
    );
    const bridge = new ParamProvenanceBridge({
        root,
        store,
        intentExecutor: new IntentExecutor(store),
    });
    worlds.push({ root, bridge });
    const intent = {
        ...getRegionProjection(producer),
        polygon: /** @type {[number,number][]} */ ([
            [0, 0],
            [1, 0],
            [0, 1],
        ]),
    };
    const value = () => root.paramRuntime.getValue("lasso");
    const select = () =>
        paramView.paramRuntime.setValue(
            "lasso",
            materializeRegionSelectionForView(
                createPendingRegionSelection(intent),
                producer
            )
        );
    /** @param {import("./paramProvenanceTypes.d.ts").ParamValueRegion} value */
    const restore = (value) =>
        store.dispatch(
            paramProvenanceSlice.actions.paramChange({ selector, value })
        );
    return {
        root,
        producer,
        filtered,
        store,
        bridge,
        intent,
        value,
        select,
        restore,
        key: makeParamSelectorKey(selector),
    };
}

test("lasso provenance stores geometry and replays undo/redo without additional actions", async () => {
    const world = await setup();
    world.select();
    await world.bridge.whenApplied();
    const stored =
        world.store.getState().provenance.present.paramProvenance.entries[key]
            .value;
    expect(stored).toEqual({ type: "region", intent: world.intent });
    expect(Object.keys(stored)).toEqual(["type", "intent"]);
    expect(world.filtered.getCollector().getItemCount()).toBe(2);
    const past = world.store.getState().provenance.past.length;
    const title = templateResultToString(
        getParamActionInfo(
            world.store.getState().provenance.present.lastAction,
            world.root
        ).title
    ).replace(/<[^>]*>/g, "");
    expect(title).toContain("Lasso selection");
    world.store.dispatch(ActionCreators.undo());
    await world.bridge.whenApplied();
    expect(world.value().status).toBe("cleared");
    expect(world.filtered.getCollector().getItemCount()).toBe(0);
    world.store.dispatch(ActionCreators.redo());
    await world.bridge.whenApplied();
    expect(Array.from(world.value().data.values(), (row) => row.name)).toEqual([
        "A",
        "C",
    ]);
    expect(world.store.getState().provenance.past).toHaveLength(past);
    expect(world.store.getState().provenance.future).toHaveLength(0);
});

test("undo restores the previous completed lasso using production history grouping", async () => {
    const world = await setup();
    world.select();
    await world.bridge.whenApplied();
    const first = structuredClone(world.intent);
    world.intent.polygon = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
    ];
    world.select();
    await world.bridge.whenApplied();
    expect(world.value().data.size).toBe(3);

    world.store.dispatch(ActionCreators.undo());
    await world.bridge.whenApplied();
    expect(world.value().intent).toEqual(first);
    expect(Array.from(world.value().data.values(), (row) => row.name)).toEqual([
        "A",
        "C",
    ]);
});

test("pushed lasso selections capture and replay through their ancestor value", async () => {
    const world = await setup(cells, true);
    world.select();
    await world.bridge.whenApplied();
    expect(
        world.store.getState().provenance.present.paramProvenance.entries[
            world.key
        ].value.intent
    ).toEqual(world.intent);
    world.store.dispatch(ActionCreators.undo());
    await world.bridge.whenApplied();
    expect(world.value().status).toBe("cleared");
    world.store.dispatch(ActionCreators.redo());
    await world.bridge.whenApplied();
    expect(Array.from(world.value().data.values(), (row) => row.name)).toEqual([
        "A",
        "C",
    ]);
});

test("JSON bookmark replay uses captured scales and regenerated IDs in a reordered population", async () => {
    const original = await setup();
    original.select();
    await original.bridge.whenApplied();
    const stored = JSON.parse(
        JSON.stringify(
            original.store.getState().provenance.present.paramProvenance
                .entries[key].value
        )
    );
    const reloaded = await setup([cells[1], cells[2], cells[0]]);
    reloaded.producer.getScaleResolution("x").getScale().domain([1, 1000]);
    reloaded.producer.getScaleResolution("y").getScale().domain([0, 400]);
    reloaded.restore(stored);
    await reloaded.bridge.whenApplied();
    expect(
        Array.from(reloaded.value().data.values(), (row) => row.name).sort()
    ).toEqual(["A", "C"]);
    expect(Array.from(reloaded.value().data.keys())).not.toEqual(
        Array.from(original.value().data.keys())
    );
    expect(reloaded.filtered.getCollector().getItemCount()).toBe(2);
    expect(reloaded.store.getState().provenance.past).toHaveLength(1);
});

test("whenApplied waits for pending membership and downstream propagation without capturing replay", async () => {
    const world = await setup();
    world.producer.getCollector().reset();
    world.restore({ type: "region", intent: world.intent });
    let applied = false;
    const pending = world.bridge.whenApplied().then(() => {
        applied = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(world.value().status).toBe("pending");
    expect(applied).toBe(false);
    world.root.context.dataFlow
        .findNamedDataSource("cells")
        .dataSource.updateDynamicData([cells[0]]);
    await pending;
    expect(world.value().status).toBe("ready");
    expect(world.filtered.getCollector().getItemCount()).toBe(1);
    expect(world.store.getState().provenance.past).toHaveLength(1);
});

test("undo supersedes a pending replay and cannot publish old geometry after loading", async () => {
    const world = await setup();
    world.producer.getCollector().reset();
    world.restore({ type: "region", intent: world.intent });
    await Promise.resolve();
    await Promise.resolve();
    expect(world.value().status).toBe("pending");
    const pending = world.bridge.whenApplied();
    world.store.dispatch(ActionCreators.undo());
    await world.bridge.whenApplied();
    await pending;
    world.root.context.dataFlow
        .findNamedDataSource("cells")
        .dataSource.updateDynamicData(cells);
    await world.root.paramRuntime.whenPropagated();
    expect(world.value().status).toBe("cleared");
    expect(world.filtered.getCollector().getItemCount()).toBe(0);
    expect(world.store.getState().provenance.future).toHaveLength(1);
});

test("zero-match polygons remain active and clear remains geometric empty state", async () => {
    const world = await setup();
    world.restore({
        type: "region",
        intent: {
            ...world.intent,
            polygon: [
                [0.8, 0.8],
                [1, 0.8],
                [1, 1],
            ],
        },
    });
    await world.bridge.whenApplied();
    expect(world.value()).toMatchObject({ status: "ready", data: new Map() });
    expect(
        world.store.getState().provenance.present.paramProvenance.entries[key]
            .value.intent
    ).not.toBeNull();
    world.restore({ type: "region", intent: null });
    await world.bridge.whenApplied();
    expect(world.value().status).toBe("cleared");
});

test("queued replay does not run after bridge disposal", async () => {
    const world = await setup();
    world.restore({ type: "region", intent: world.intent });
    world.bridge.dispose();
    await Promise.resolve();
    await world.root.paramRuntime.whenPropagated();
    expect(world.value().status).toBe("cleared");
});

test("data-driving parameters settle before geometric membership is replayed", async () => {
    const world = await setup();
    world.restore({ type: "region", intent: world.intent });
    world.store.dispatch(
        paramProvenanceSlice.actions.paramChange({
            selector: { scope: [], param: "showA" },
            value: { type: "value", value: false },
        })
    );
    await world.bridge.whenApplied();
    expect(world.value().status).toBe("ready");
    expect(Array.from(world.value().data.values(), (row) => row.name)).toEqual([
        "C",
    ]);
    expect(world.store.getState().provenance.past).toHaveLength(2);
});

test("removing a pending producer releases the completion barrier", async () => {
    const world = await setup();
    world.producer.getCollector().reset();
    world.restore({ type: "region", intent: world.intent });
    const pending = world.bridge.whenApplied();
    await Promise.resolve();
    await Promise.resolve();
    await createViewMutationApi({ viewRoot: world.root }).remove({
        scope: [],
        view: "points",
    });
    await pending;
    expect(world.value().status).toBe("cleared");
    expect(world.filtered.getCollector().getItemCount()).toBe(0);
});

test("redo while loading rebuilds only the latest current population", async () => {
    const world = await setup();
    world.producer.getCollector().reset();
    world.restore({ type: "region", intent: world.intent });
    await Promise.resolve();
    await Promise.resolve();
    world.store.dispatch(ActionCreators.undo());
    await world.bridge.whenApplied();
    world.store.dispatch(ActionCreators.redo());
    const pending = world.bridge.whenApplied();
    await Promise.resolve();
    await Promise.resolve();
    world.root.context.dataFlow
        .findNamedDataSource("cells")
        .dataSource.updateDynamicData([cells[1]]);
    await pending;
    expect(world.value()).toMatchObject({ status: "ready", data: new Map() });
    expect(world.value().intent).toEqual(world.intent);
    expect(world.filtered.getCollector().getItemCount()).toBe(0);
    expect(world.store.getState().provenance.past).toHaveLength(1);
});

test.each(["fields", "consumer", "polygon"])(
    "incompatible %s intent warns and falls back to clear",
    async (kind) => {
        const world = await setup();
        const intent = structuredClone(world.intent);
        if (kind === "fields") intent.fields.x = "otherX";
        else if (kind === "consumer") intent.producer.view = "filtered";
        else
            intent.polygon = [
                [NaN, 0],
                [1, 0],
                [0, 1],
            ];
        world.restore({ type: "region", intent });
        await world.bridge.whenApplied();
        expect(world.value().status).toBe("cleared");
        const { showMessageDialog } =
            await import("../components/generic/messageDialog.js");
        expect(showMessageDialog).toHaveBeenCalled();
    }
);

test("pending completion supports abort, timeout, and bridge disposal", async () => {
    vi.useFakeTimers();
    const world = await setup();
    world.producer.getCollector().reset();
    world.restore({ type: "region", intent: world.intent });
    const controller = new AbortController();
    const aborted = expect(
        world.bridge.whenApplied({ signal: controller.signal })
    ).rejects.toThrow("aborted");
    controller.abort();
    await aborted;
    const timed = expect(
        world.bridge.whenApplied({ timeoutMs: 10 })
    ).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(10);
    await timed;
    const disposed = world.bridge.whenApplied();
    world.bridge.dispose();
    await disposed;
    world.root.context.dataFlow
        .findNamedDataSource("cells")
        .dataSource.updateDynamicData(cells);
    await world.root.paramRuntime.whenPropagated();
    expect(world.store.getState().provenance.past).toHaveLength(1);
});

test("pending lasso waits for lookup readiness after empty primary publication", async () => {
    const world = await setup(cells, false, true);
    const collector = world.producer.getCollector();
    const lookup = iterateDataDependencies(collector).find(
        (node) => node.dataDependencies.length > 0
    );
    lookup.dataDependencies[0].reset();
    collector.reset();
    world.restore({ type: "region", intent: world.intent });
    await Promise.resolve();
    expect(world.value().status).toBe("pending");
    const barrier = world.bridge.whenApplied();

    // Bound a regressed observer loop so the assertion fails instead of hanging Vitest.
    const observe = collector.observe.bind(collector);
    let attachments = 0;
    vi.spyOn(collector, "observe").mockImplementation((callback) => {
        if (++attachments > 20)
            throw new Error("Replay did not yield during publication");
        return observe(callback);
    });
    const source =
        world.root.context.dataFlow.findNamedDataSource("cells").dataSource;
    expect(() => source.updateDynamicData([])).not.toThrow();
    expect(isDataReady(collector)).toBe(false);
    expect(world.value().status).toBe("pending");

    world.root.context.dataFlow
        .findNamedDataSource("foreign")
        .dataSource.updateDynamicData([{ name: "A", score: 1 }]);
    await barrier;
    expect(world.value().status).toBe("ready");
    expect(world.value().data.size).toBe(0);
});

test("pending lasso reports the original lookup publication failure", async () => {
    const world = await setup(cells, false, true);
    const collector = world.producer.getCollector();
    const lookup = iterateDataDependencies(collector).find(
        (node) => node.dataDependencies.length > 0
    );
    lookup.dataDependencies[0].reset();
    collector.reset();
    world.restore({ type: "region", intent: world.intent });
    const failure = expect(world.bridge.whenApplied()).rejects.toThrow(
        "Duplicate lookup key"
    );
    await Promise.resolve();
    await Promise.resolve();

    world.root.context.dataFlow
        .findNamedDataSource("foreign")
        .dataSource.updateDynamicData([
            { name: "A", score: 1 },
            { name: "A", score: 2 },
        ]);
    expect(() => world.root.paramRuntime.flushNow()).toThrow(
        "Duplicate lookup key"
    );
    await failure;
    await expect(world.bridge.whenApplied()).rejects.toThrow(
        "Duplicate lookup key"
    );

    world.root.context.dataFlow
        .findNamedDataSource("foreign")
        .dataSource.updateDynamicData([{ name: "A", score: 1 }]);
    world.root.context.dataFlow
        .findNamedDataSource("cells")
        .dataSource.updateDynamicData(cells);
    world.restore({ type: "region", intent: world.intent });
    await world.bridge.whenApplied();
    expect(world.value().status).toBe("ready");
});

test.each([
    { reversed: false, loading: false },
    { reversed: true, loading: false },
    { reversed: false, loading: true },
    { reversed: true, loading: true },
])(
    "dependent lasso survives combined restoration ($reversed, loading: $loading)",
    async ({ reversed, loading }) => {
        const { view: root } = await createHeadlessEngine({
            datasets: { cells },
            data: { name: "cells" },
            transform: [{ type: "identifier" }],
            params: [
                { name: "first", value: null },
                { name: "second", value: null },
            ],
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    axis: null,
                    scale: { domain: [0, 100] },
                },
                y: {
                    field: "y",
                    type: "quantitative",
                    axis: null,
                    scale: { domain: [0, 100] },
                },
            },
            hconcat: (reversed ? ["b", "a"] : ["a", "b"]).map((name) =>
                name === "a"
                    ? {
                          name: "a",
                          mark: "point",
                          params: [
                              {
                                  name: "first",
                                  select: "region",
                                  push: "outer",
                              },
                          ],
                      }
                    : {
                          name: "b",
                          mark: "point",
                          params: [
                              {
                                  name: "second",
                                  select: "region",
                                  push: "outer",
                              },
                          ],
                          transform: [
                              { type: "filter", param: "first", empty: false },
                          ],
                      }
            ),
        });
        const [a, b] = ["a", "b"].map((name) =>
            root.getDescendants().find((v) => v.explicitName === name)
        );
        const store = configureStore({
            reducer: {
                provenance: createProvenanceReducer(
                    { paramProvenance: paramProvenanceSlice.reducer },
                    { groupBy: getParamChangeGroupKey }
                ),
            },
        });
        for (const param of ["first", "second"])
            store.dispatch(
                paramProvenanceSlice.actions.paramChange({
                    selector: { scope: [], param },
                    value: { type: "region", intent: null },
                })
            );
        const bridge = new ParamProvenanceBridge({
            root,
            store,
            intentExecutor: new IntentExecutor(store),
        });
        worlds.push({ root, bridge });
        const polygon = [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
        ];
        const first = { ...getRegionProjection(a), polygon };
        a.paramRuntime.setValue(
            "first",
            materializeRegionSelectionForView(
                createPendingRegionSelection(first),
                a
            )
        );
        await bridge.whenApplied();
        const second = { ...getRegionProjection(b), polygon };
        b.paramRuntime.setValue(
            "second",
            materializeRegionSelectionForView(
                createPendingRegionSelection(second),
                b
            )
        );
        await bridge.whenApplied();
        store.dispatch(ActionCreators.undo());
        await bridge.whenApplied();
        store.dispatch(ActionCreators.undo());
        await bridge.whenApplied();
        expect(b.getCollector().getItemCount()).toBe(0);
        if (loading) a.getCollector().reset();
        store.dispatch(ActionCreators.redo());
        store.dispatch(ActionCreators.redo());
        if (loading) {
            await Promise.resolve();
            expect(root.paramRuntime.findValue("first").status).toBe("pending");
            root.context.dataFlow
                .findNamedDataSource("cells")
                .dataSource.updateDynamicData(cells);
        }
        await bridge.whenApplied();
        expect(root.paramRuntime.findValue("first").status).toBe("ready");
        expect(b.paramRuntime.findValue("second").status).toBe("ready");
        expect(b.paramRuntime.findValue("second").data.size).toBe(3);
    }
);
