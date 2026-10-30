// @ts-check
import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";
import { ActionCreators } from "redux-undo";
import { createTestEmbed } from "@genome-spy/core/view/embedTestUtils.js";
import UnitView from "@genome-spy/core/view/unitView.js";
import { createCategorySelection } from "@genome-spy/core/selection/categorySelection.js";
import ViewParamRuntime from "@genome-spy/core/paramRuntime/viewParamRuntime.js";
import {
    createIntervalSelection,
    createMultiPointSelection,
} from "@genome-spy/core/selection/selection.js";
import { createProvenanceReducer } from "./provenanceReducerBuilder.js";
import { paramProvenanceSlice } from "./paramProvenanceSlice.js";
import ParamProvenanceBridge from "./paramProvenanceBridge.js";
import IntentExecutor from "./intentExecutor.js";
import {
    makeParamSelectorKey,
    getBookmarkableParams,
    validateSelectorConstraints,
} from "@genome-spy/core/view/viewSelectors.js";
import { flushMicrotasks } from "./testUtils.js";
import templateResultToString from "../utils/templateResultToString.js";
import { compressToUrlHash, decompressFromUrlHash } from "../utils/urlHash.js";

vi.mock("../components/generic/messageDialog.js", () => ({
    showMessageDialog: vi.fn(),
}));

class FakeCollector {
    /** @type {boolean} */
    completed = true;

    /** @type {(() => void)[]} */
    #listeners = [];

    /** @type {(fields: string[], tuple: import("@genome-spy/core/spec/channel.js").Scalar[]) => any} */
    #resolver;

    /** @type {any[]} */
    #data;

    constructor(resolver, data = []) {
        this.#resolver = resolver;
        this.#data = data;
    }

    findDatumByKey(fields, tuple) {
        return this.#resolver(fields, tuple);
    }

    observe(listener) {
        this.#listeners.push(listener);
        return () => {
            const idx = this.#listeners.indexOf(listener);
            if (idx >= 0) {
                this.#listeners.splice(idx, 1);
            }
        };
    }

    notify() {
        for (const listener of this.#listeners) {
            listener();
        }
    }

    visitData(visitor) {
        for (const datum of this.#data) {
            visitor(datum);
        }
    }
}

class FakeView {
    /** @param {{ animator?: any }} [options] */
    constructor(options = {}) {
        this.paramRuntime = new ViewParamRuntime(
            undefined,
            undefined,
            options.animator
        );
        this.explicitName = "root";
        this.spec = {};
        this.encoding = {};
        this.scaleResolution = null;
        this.getCollector = () => undefined;
    }

    visit(visitor) {
        visitor(this);
    }

    getDataAncestors() {
        return [];
    }

    getEncoding() {
        return this.encoding ?? {};
    }

    getScaleResolution() {
        return this.scaleResolution ?? null;
    }
}

function createTestAnimator() {
    /** @type {((timestamp: number) => void)[]} */
    const callbacks = [];
    let timestamp = performance.now();

    return {
        /** @param {(timestamp: number) => void} callback */
        requestTransition(callback) {
            const index = callbacks.indexOf(callback);
            if (index >= 0) {
                callbacks.splice(index, 1);
            }
            callbacks.push(callback);
        },
        /** @param {(timestamp: number) => void} callback */
        cancelTransition(callback) {
            const index = callbacks.indexOf(callback);
            if (index >= 0) {
                callbacks.splice(index, 1);
            }
        },
        requestRender() {
            //
        },
        step(ms = 16) {
            timestamp += ms;
            const pending = callbacks.splice(0);
            for (const callback of pending) {
                callback(timestamp);
            }
        },
    };
}

/**
 * @returns {import("@reduxjs/toolkit").EnhancedStore<any>}
 */
function createStore() {
    const provenanceReducer = createProvenanceReducer({
        [paramProvenanceSlice.name]: paramProvenanceSlice.reducer,
    });

    return configureStore({
        reducer: combineReducers({
            provenance: provenanceReducer,
        }),
        middleware: (getDefaultMiddleware) =>
            getDefaultMiddleware({ serializableCheck: false }),
    });
}

/**
 * @param {FakeView} view
 * @param {import("@reduxjs/toolkit").EnhancedStore<any>} store
 * @param {IntentExecutor} intentExecutor
 */
function createBridge(view, store, intentExecutor) {
    return new ParamProvenanceBridge({
        root: /** @type {any} */ (view),
        store,
        intentExecutor,
    });
}

/**
 * @returns {Promise<any>}
 */
async function getShowMessageDialogMock() {
    const { showMessageDialog } =
        await import("../components/generic/messageDialog.js");
    return /** @type {any} */ (showMessageDialog);
}

describe("ParamProvenanceBridge", () => {
    it("captures shared raw categories and replays URL state, clear, undo, and redo without data lookup", async () => {
        vi.useFakeTimers();
        const { root, views } = await createTestEmbed({
            params: [
                {
                    name: "focus",
                    select: { type: "point", encodings: ["color"] },
                },
            ],
            hconcat: [
                {
                    name: "source",
                    params: [
                        {
                            name: "focus",
                            select: { type: "point", encodings: ["color"] },
                            push: "outer",
                        },
                    ],
                    mark: "point",
                    data: { values: [{ state: 1 }] },
                    encoding: {
                        color: {
                            field: "state",
                            type: "ordinal",
                            legend: null,
                            scale: { domain: [1, "1", false] },
                        },
                    },
                },
            ],
        });
        const source = root
            .getDescendants()
            .find((view) => view instanceof UnitView && view.name === "source");
        if (!(source instanceof UnitView))
            throw new Error("Expected source unit");
        // Category persistence must work even when no source collector is ready.
        expect(
            getBookmarkableParams(root).map((entry) => entry.param.name)
        ).toEqual(["focus"]);
        expect(validateSelectorConstraints(root)).toEqual([]);
        const lookup = vi
            .spyOn(source, "getCollector")
            .mockImplementation(() => {
                throw new Error("Unexpected row lookup");
            });
        const store = createStore();
        const bridge = new ParamProvenanceBridge({
            root,
            store,
            intentExecutor: new IntentExecutor(store),
        });
        try {
            const selection = views.root().params.getSelection("focus");
            if (
                selection.type !== "point" ||
                selection.membership !== "categories"
            )
                throw new Error("Expected categories");
            const selector = { scope: [], param: "focus" };
            const key = makeParamSelectorKey(selector);
            const settle = async () => {
                await root.paramRuntime.whenPropagated();
                vi.advanceTimersByTime(200);
                await bridge.whenApplied();
            };
            selection.setValue([[1], ["1"], [false], ["not loaded"]]);
            await settle();
            const entry =
                store.getState().provenance.present.paramProvenance.entries[
                    key
                ];
            expect(entry).toEqual({
                selector,
                value: {
                    type: "point",
                    membership: "categories",
                    encodings: ["color"],
                    values: [[1], ["1"], [false], ["not loaded"]],
                },
            });
            expect(
                Object.keys(
                    store.getState().provenance.present.paramProvenance.entries
                )
            ).toHaveLength(1);

            selection.clear();
            await settle();
            expect(selection.getValue().values).toEqual([]);
            store.dispatch(ActionCreators.undo());
            await settle();
            expect(selection.getValue().values).toEqual(entry.value.values);
            store.dispatch(ActionCreators.redo());
            await settle();
            expect(selection.getValue().active).toBe(false);

            const bookmark = decompressFromUrlHash(
                compressToUrlHash({
                    actions: [paramProvenanceSlice.actions.paramChange(entry)],
                })
            );
            store.dispatch(bookmark.actions[0]);
            await settle();
            expect(selection.getValue().values).toEqual(entry.value.values);
            expect(lookup).not.toHaveBeenCalled();
        } finally {
            bridge.dispose();
            lookup.mockRestore();
            vi.useRealTimers();
        }
    });

    it("rejects incompatible category restores atomically and does not wait for a collector", async () => {
        const view = new FakeView();
        view.paramRuntime.registerParam({
            name: "focus",
            select: { type: "point", encodings: ["shape"], toggle: false },
            value: [{ shape: "default" }],
        });
        const collector = new FakeCollector(vi.fn());
        collector.completed = false;
        view.getCollector = vi.fn(() => collector);
        const store = createStore();
        const bridge = createBridge(view, store, new IntentExecutor(store));
        try {
            for (const value of [
                { type: "point", keyFields: ["id"], keys: [["A"]] },
                {
                    type: "point",
                    membership: "categories",
                    encodings: ["color"],
                    values: [["A"]],
                },
                {
                    type: "point",
                    membership: "categories",
                    encodings: ["shape"],
                    values: [["A"], ["B"]],
                },
                {
                    type: "point",
                    membership: "categories",
                    encodings: ["shape"],
                    values: [["A"], [null]],
                },
            ]) {
                store.dispatch(
                    paramProvenanceSlice.actions.paramChange({
                        selector: { scope: [], param: "focus" },
                        value: /** @type {any} */ (value),
                    })
                );
                await bridge.whenApplied();
                expect(view.paramRuntime.getValue("focus")).toEqual(
                    createCategorySelection("shape", ["default"])
                );
            }
            store.dispatch(
                paramProvenanceSlice.actions.paramChange({
                    selector: { scope: [], param: "focus" },
                    value: {
                        type: "point",
                        membership: "categories",
                        encodings: ["shape"],
                        values: [["later"]],
                    },
                })
            );
            await bridge.whenApplied();
            expect(view.paramRuntime.getValue("focus")).toEqual(
                createCategorySelection("shape", ["later"])
            );
            expect(view.getCollector).not.toHaveBeenCalled();
        } finally {
            bridge.dispose();
        }
    });

    it("captures param changes into provenance", () => {
        const view = new FakeView();
        const setter = view.paramRuntime.registerParam({
            name: "threshold",
            value: 1,
            bind: { input: "range" },
        });

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        createBridge(view, store, intentExecutor);

        setter(5);

        const key = makeParamSelectorKey({ scope: [], param: "threshold" });
        const entry =
            store.getState().provenance.present.paramProvenance.entries[key];
        expect(entry.value).toEqual({ type: "value", value: 5 });
    });

    it("serializes locus interval selections using complex domains", async () => {
        vi.useFakeTimers();
        try {
            const view = new FakeView();
            view.getScaleResolution = () => ({
                type: "locus",
                toComplex: (value) => ({ chrom: "chr1", pos: value }),
                fromComplex: (value) => value,
            });
            const setter = view.paramRuntime.registerParam({
                name: "brush",
                select: { type: "interval", encodings: ["x"] },
            });

            const store = createStore();
            const intentExecutor = new IntentExecutor(store);
            createBridge(view, store, intentExecutor);

            const selection = createIntervalSelection(["x"]);
            selection.intervals.x = [10, 20];
            setter(selection);

            vi.runAllTimers();
            await flushMicrotasks();

            const key = makeParamSelectorKey({ scope: [], param: "brush" });
            const entry =
                store.getState().provenance.present.paramProvenance.entries[
                    key
                ];
            expect(entry.value.intervals.x).toEqual([
                { chrom: "chr1", pos: 10 },
                { chrom: "chr1", pos: 20 },
            ]);
        } finally {
            vi.useRealTimers();
        }
    });

    it("throttles rapid updates for bound parameters", async () => {
        vi.useFakeTimers();
        try {
            const view = new FakeView();
            const setter = view.paramRuntime.registerParam({
                name: "alpha",
                value: 0,
                bind: { input: "range" },
            });

            const store = createStore();
            const intentExecutor = new IntentExecutor(store);
            const dispatchSpy = vi.spyOn(intentExecutor, "dispatch");
            createBridge(view, store, intentExecutor);

            setter(1);
            await flushMicrotasks();

            setter(2);
            setter(3);
            await flushMicrotasks();

            expect(dispatchSpy).toHaveBeenCalledTimes(1);

            vi.advanceTimersByTime(200);
            await flushMicrotasks();

            expect(dispatchSpy).toHaveBeenCalledTimes(2);
            expect(view.paramRuntime.getValue("alpha")).toBe(3);
            const entry =
                store.getState().provenance.present.paramProvenance.entries[
                    makeParamSelectorKey({ scope: [], param: "alpha" })
                ];
            expect(entry.value).toEqual({ type: "value", value: 3 });
        } finally {
            vi.useRealTimers();
        }
    });

    it("does not replay a transitioned bound parameter when provenance captures its target", async () => {
        const animator = createTestAnimator();
        const view = new FakeView({ animator });
        const setter = view.paramRuntime.registerParam({
            name: "laneHeight",
            value: 12,
            bind: { input: "range" },
            transition: { type: "lerp", halfLife: 60, epsilon: 0.001 },
        });

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        createBridge(view, store, intentExecutor);

        setter(13);
        animator.step();
        await flushMicrotasks();

        expect(view.paramRuntime.getTargetValue("laneHeight")).toBe(13);
        expect(view.paramRuntime.getValue("laneHeight")).toBeGreaterThan(12);
        expect(view.paramRuntime.getValue("laneHeight")).toBeLessThan(12.2);
    });

    it("applies stored param values to the mediator", async () => {
        const view = new FakeView();
        view.paramRuntime.registerParam({
            name: "alpha",
            value: 0,
            bind: { input: "range" },
        });

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        createBridge(view, store, intentExecutor);

        const action = paramProvenanceSlice.actions.paramChange({
            selector: { scope: [], param: "alpha" },
            value: { type: "value", value: 0.75 },
        });
        store.dispatch(action);

        // Non-obvious: bridge applies values on a microtask tick.
        await flushMicrotasks();

        expect(view.paramRuntime.getValue("alpha")).toBe(0.75);
    });

    it("preserves live interval selections when provenance is empty at startup", () => {
        const view = new FakeView();
        const setter = view.paramRuntime.registerParam({
            name: "brush",
            select: { type: "interval", encodings: ["x"] },
        });

        const selection = createIntervalSelection(["x"]);
        selection.intervals.x = [10, 20];
        setter(selection);

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        createBridge(view, store, intentExecutor);

        expect(view.paramRuntime.getValue("brush").intervals.x).toEqual([
            10, 20,
        ]);
    });

    it("whenApplied waits for queued provenance apply and propagation", async () => {
        const view = new FakeView();
        view.paramRuntime.registerParam({
            name: "alpha",
            value: 0,
            bind: { input: "range" },
        });

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        const bridge = createBridge(view, store, intentExecutor);

        const action = paramProvenanceSlice.actions.paramChange({
            selector: { scope: [], param: "alpha" },
            value: { type: "value", value: 0.5 },
        });
        store.dispatch(action);

        await bridge.whenApplied();

        expect(view.paramRuntime.getValue("alpha")).toBe(0.5);
    });

    it("serializes point selections using encoding.key", async () => {
        const view = new FakeView();
        view.encoding = { key: { field: "id" } };
        const setter = view.paramRuntime.registerParam({
            name: "selection",
            select: { type: "point" },
        });

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        createBridge(view, store, intentExecutor);

        const datum = { id: "A", __uniqueId: 1 };
        setter(createMultiPointSelection([datum]));

        const key = makeParamSelectorKey({ scope: [], param: "selection" });
        const entry =
            store.getState().provenance.present.paramProvenance.entries[key];
        expect(entry.value).toEqual({
            type: "point",
            keyFields: ["id"],
            keys: [["A"]],
        });

        await flushMicrotasks();
    });

    it("serializes point selections using composite encoding.key", async () => {
        const view = new FakeView();
        view.encoding = {
            key: [{ field: "sampleId" }, { field: "chrom" }, { field: "pos" }],
        };
        const setter = view.paramRuntime.registerParam({
            name: "selection",
            select: { type: "point", toggle: true },
        });

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        createBridge(view, store, intentExecutor);

        setter(
            createMultiPointSelection([
                { sampleId: "S1", chrom: "chr1", pos: 10, __uniqueId: 1 },
                { sampleId: "S2", chrom: "chr2", pos: 20, __uniqueId: 2 },
            ])
        );

        const key = makeParamSelectorKey({ scope: [], param: "selection" });
        const entry =
            store.getState().provenance.present.paramProvenance.entries[key];
        expect(entry.value).toEqual({
            type: "point",
            keyFields: ["sampleId", "chrom", "pos"],
            keys: [
                ["S1", "chr1", 10],
                ["S2", "chr2", 20],
            ],
        });
    });

    it("warns and skips point selections when encoding.key is missing", async () => {
        const showMessageDialog = await getShowMessageDialogMock();

        const view = new FakeView();
        const setter = view.paramRuntime.registerParam({
            name: "selection",
            select: { type: "point" },
        });

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        createBridge(view, store, intentExecutor);

        setter(createMultiPointSelection([{ id: "A", __uniqueId: 1 }]));
        await flushMicrotasks();

        expect(showMessageDialog).toHaveBeenCalled();
        expect(
            Object.keys(
                store.getState().provenance.present.paramProvenance.entries
            )
        ).toHaveLength(0);
    });

    it("warns and skips point selections when encoding.key is not unique", async () => {
        const showMessageDialog = await getShowMessageDialogMock();
        showMessageDialog.mockClear();

        const view = new FakeView();
        view.encoding = { key: { field: "name" } };
        view.getCollector = () =>
            new FakeCollector(() => {
                throw new Error(
                    'Duplicate key detected for fields [name]: "duplicate-id"'
                );
            });

        const setter = view.paramRuntime.registerParam({
            name: "selection",
            select: { type: "point", toggle: true },
        });

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        createBridge(view, store, intentExecutor);

        setter(
            createMultiPointSelection([{ name: "duplicate-id", __uniqueId: 1 }])
        );
        await flushMicrotasks();

        expect(showMessageDialog).toHaveBeenCalled();
        const lastCall = showMessageDialog.mock.calls.at(-1);
        expect(lastCall?.[1]?.title).toBe("Bookmark persistence warnings");
        expect(
            Object.keys(
                store.getState().provenance.present.paramProvenance.entries
            )
        ).toHaveLength(0);
    });

    it("restores point selections and warns on unresolved keys", async () => {
        const showMessageDialog = await getShowMessageDialogMock();

        const view = new FakeView();
        view.encoding = { key: { field: "id" } };
        view.paramRuntime.registerParam({
            name: "selection",
            select: { type: "point", toggle: true },
        });

        const collector = new FakeCollector((fields, tuple) => {
            if (tuple[0] === "A") {
                return { id: "A", __uniqueId: 1 };
            }
            return undefined;
        });
        view.getCollector = () => collector;

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        createBridge(view, store, intentExecutor);

        store.dispatch(
            paramProvenanceSlice.actions.paramChange({
                selector: { scope: [], param: "selection" },
                value: {
                    type: "point",
                    keyFields: ["id"],
                    keys: [["A"], ["B"]],
                },
            })
        );

        await flushMicrotasks();

        const selection = view.paramRuntime.getValue("selection");
        expect(selection.data.size).toBe(1);
        expect(showMessageDialog).toHaveBeenCalled();
    });

    it("applies point expansion using predicate and partition fields", async () => {
        const view = new FakeView();
        view.encoding = { key: { field: "id" } };
        view.paramRuntime.registerParam({
            name: "selection",
            select: { type: "point", toggle: true },
        });

        const datums = [
            { id: "seed", clusterId: "C1", patientId: "P1", __uniqueId: 1 },
            { id: "A", clusterId: "C1", patientId: "P1", __uniqueId: 2 },
            { id: "B", clusterId: "C1", patientId: "P2", __uniqueId: 3 },
            { id: "C", clusterId: "C2", patientId: "P1", __uniqueId: 4 },
        ];
        const byId = new Map(datums.map((datum) => [datum.id, datum]));
        view.getCollector = () =>
            new FakeCollector((fields, tuple) => byId.get(tuple[0]), datums);

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        createBridge(view, store, intentExecutor);

        store.dispatch(
            paramProvenanceSlice.actions.expandPointSelection({
                selector: { scope: [], param: "selection" },
                operation: "replace",
                predicate: {
                    field: "clusterId",
                    op: "eq",
                    valueFromField: "clusterId",
                },
                partitionBy: ["patientId"],
                origin: {
                    view: { scope: [], view: "root" },
                    keyTuple: ["seed"],
                },
            })
        );

        await flushMicrotasks();

        const selection = view.paramRuntime.getValue("selection");
        expect(selection.data.size).toBe(2);
        expect(selection.data.has(1)).toBe(true);
        expect(selection.data.has(2)).toBe(true);
    });

    it("applies point expansion when origin uses composite key fields", async () => {
        const view = new FakeView();
        view.encoding = {
            key: [{ field: "sample" }, { field: "CHROM" }, { field: "POS" }],
        };
        view.paramRuntime.registerParam({
            name: "selection",
            select: { type: "point", toggle: true },
        });

        const datums = [
            {
                sample: "S1",
                CHROM: "chr1",
                POS: 100,
                Func: "missense",
                __uniqueId: 1,
            },
            {
                sample: "S1",
                CHROM: "chr2",
                POS: 200,
                Func: "missense",
                __uniqueId: 2,
            },
            {
                sample: "S2",
                CHROM: "chr3",
                POS: 300,
                Func: "missense",
                __uniqueId: 3,
            },
        ];

        const byKey = new Map(
            datums.map((datum) => [
                datum.sample + "|" + datum.CHROM + "|" + datum.POS,
                datum,
            ])
        );
        view.getCollector = () =>
            new FakeCollector(
                (fields, tuple) => byKey.get(tuple.join("|")),
                datums
            );

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        createBridge(view, store, intentExecutor);

        store.dispatch(
            paramProvenanceSlice.actions.expandPointSelection({
                selector: { scope: [], param: "selection" },
                operation: "replace",
                rule: {
                    kind: "sameFieldValue",
                    field: "Func",
                },
                partitionBy: ["sample"],
                origin: {
                    view: { scope: [], view: "root" },
                    keyTuple: ["S1", "chr1", 100],
                },
            })
        );

        await flushMicrotasks();

        const selection = view.paramRuntime.getValue("selection");
        expect(selection.data.size).toBe(2);
        expect(selection.data.has(1)).toBe(true);
        expect(selection.data.has(2)).toBe(true);
        expect(selection.data.has(3)).toBe(false);
    });

    it("applies point expansion for dotted literal fields in flat datums", async () => {
        const view = new FakeView();
        view.encoding = { key: { field: "id" } };
        view.paramRuntime.registerParam({
            name: "selection",
            select: { type: "point", toggle: true },
        });

        const datums = [
            { id: "seed", "Gene.refGene": "GRM8", __uniqueId: 1 },
            { id: "A", "Gene.refGene": "GRM8", __uniqueId: 2 },
            { id: "B", "Gene.refGene": "TP53", __uniqueId: 3 },
        ];
        const byId = new Map(datums.map((datum) => [datum.id, datum]));
        view.getCollector = () =>
            new FakeCollector((fields, tuple) => byId.get(tuple[0]), datums);

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        createBridge(view, store, intentExecutor);

        store.dispatch(
            paramProvenanceSlice.actions.expandPointSelection({
                selector: { scope: [], param: "selection" },
                operation: "replace",
                rule: {
                    kind: "sameFieldValue",
                    field: "Gene.refGene",
                },
                origin: {
                    view: { scope: [], view: "root" },
                    keyTuple: ["seed"],
                },
            })
        );

        await flushMicrotasks();

        const selection = view.paramRuntime.getValue("selection");
        expect(selection.data.size).toBe(2);
        expect(selection.data.has(1)).toBe(true);
        expect(selection.data.has(2)).toBe(true);
        expect(selection.data.has(3)).toBe(false);
    });

    it("warns and falls back when non-replace expansion operation is used", async () => {
        const showMessageDialog = await getShowMessageDialogMock();
        showMessageDialog.mockClear();

        const view = new FakeView();
        view.encoding = { key: { field: "id" } };
        view.paramRuntime.registerParam({
            name: "selection",
            select: { type: "point", toggle: true },
        });

        const datums = [
            { id: "seed", clusterId: "C1", patientId: "P1", __uniqueId: 1 },
        ];
        const byId = new Map(datums.map((datum) => [datum.id, datum]));
        view.getCollector = () =>
            new FakeCollector((fields, tuple) => byId.get(tuple[0]), datums);

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        createBridge(view, store, intentExecutor);

        store.dispatch(
            paramProvenanceSlice.actions.expandPointSelection({
                selector: { scope: [], param: "selection" },
                operation: "add",
                predicate: {
                    field: "clusterId",
                    op: "eq",
                    valueFromField: "clusterId",
                },
                origin: {
                    view: { scope: [], view: "root" },
                    keyTuple: ["seed"],
                },
            })
        );

        await flushMicrotasks();

        const selection = view.paramRuntime.getValue("selection");
        expect(selection.data.size).toBe(0);
        expect(showMessageDialog).toHaveBeenCalled();
        const call = showMessageDialog.mock.calls.at(-1);
        expect(templateResultToString(call[0])).toContain(
            'unsupported operation "add"'
        );
    });

    it("shows key field names when restore fails due to duplicate keys", async () => {
        const showMessageDialog = await getShowMessageDialogMock();
        showMessageDialog.mockClear();

        const view = new FakeView();
        view.encoding = { key: { field: "name" } };
        view.paramRuntime.registerParam({
            name: "selection",
            select: { type: "point", toggle: true },
        });
        view.getCollector = () =>
            new FakeCollector(() => {
                throw new Error(
                    'Duplicate key detected for fields [name]: "duplicate-id"'
                );
            });

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        createBridge(view, store, intentExecutor);

        store.dispatch(
            paramProvenanceSlice.actions.paramChange({
                selector: { scope: [], param: "selection" },
                value: {
                    type: "point",
                    keyFields: ["name"],
                    keys: [["duplicate-id"]],
                },
            })
        );

        await flushMicrotasks();

        expect(showMessageDialog).toHaveBeenCalled();
        const call = showMessageDialog.mock.calls.at(-1);
        const message = templateResultToString(call[0]);
        expect(call[1].title).toBe("Parameter restore warnings");
        expect(message).toContain("encoding.key fields [name] are not unique");
    });

    it("warns when bookmark key fields do not match the current view", async () => {
        const showMessageDialog = await getShowMessageDialogMock();
        showMessageDialog.mockClear();

        const view = new FakeView();
        view.encoding = {
            key: [{ field: "sampleId" }, { field: "chrom" }, { field: "pos" }],
        };
        view.paramRuntime.registerParam({
            name: "selection",
            select: { type: "point", toggle: true },
        });
        view.getCollector = () => new FakeCollector(() => undefined);

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        createBridge(view, store, intentExecutor);

        store.dispatch(
            paramProvenanceSlice.actions.paramChange({
                selector: { scope: [], param: "selection" },
                value: {
                    type: "point",
                    keyFields: ["sampleId", "chrom"],
                    keys: [["S1", "chr1"]],
                },
            })
        );

        await flushMicrotasks();

        expect(showMessageDialog).toHaveBeenCalled();
        const call = showMessageDialog.mock.calls.at(-1);
        const message = templateResultToString(call[0]);
        expect(call[1].title).toBe("Parameter restore warnings");
        expect(message).toContain(
            "bookmark uses key fields [sampleId, chrom] but the view now uses [sampleId, chrom, pos]"
        );
    });

    it("restores interval selections from provenance entries", async () => {
        const view = new FakeView();
        view.paramRuntime.registerParam({
            name: "brush",
            select: { type: "interval", encodings: ["x"] },
        });

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        createBridge(view, store, intentExecutor);

        store.dispatch(
            paramProvenanceSlice.actions.paramChange({
                selector: { scope: [], param: "brush" },
                value: { type: "interval", intervals: { x: [10, 20] } },
            })
        );

        await flushMicrotasks();

        const selection = view.paramRuntime.getValue("brush");
        expect(selection.intervals.x).toEqual([10, 20]);
    });

    it("skips clear actions when the selection is already empty", async () => {
        const view = new FakeView();
        view.encoding = { key: { field: "id" } };
        const setter = view.paramRuntime.registerParam({
            name: "selection",
            select: { type: "point" },
        });

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        createBridge(view, store, intentExecutor);

        setter(createMultiPointSelection());
        await flushMicrotasks();

        expect(
            Object.keys(
                store.getState().provenance.present.paramProvenance.entries
            )
        ).toHaveLength(0);
    });

    it("undoes when clearing the last selection action", async () => {
        const view = new FakeView();
        view.encoding = { key: { field: "id" } };
        const otherSetter = view.paramRuntime.registerParam({
            name: "other",
            value: 1,
            bind: { input: "range" },
        });
        const setter = view.paramRuntime.registerParam({
            name: "selection",
            select: { type: "point" },
        });

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        createBridge(view, store, intentExecutor);

        otherSetter(2);
        await flushMicrotasks();

        setter(createMultiPointSelection([{ id: "A", __uniqueId: 1 }]));
        await flushMicrotasks();

        setter(createMultiPointSelection());
        await flushMicrotasks();

        const entries =
            store.getState().provenance.present.paramProvenance.entries;
        expect(Object.keys(entries)).toHaveLength(1);
        expect(
            entries[makeParamSelectorKey({ scope: [], param: "selection" })]
        ).toBeUndefined();
    });

    it("clears without undo when previous selection was non-empty", async () => {
        vi.useFakeTimers();
        try {
            const view = new FakeView();
            view.encoding = { key: { field: "id" } };
            view.paramRuntime.registerParam({
                name: "other",
                value: 1,
                bind: { input: "range" },
            });
            const setter = view.paramRuntime.registerParam({
                name: "selection",
                select: { type: "point" },
            });

            const store = createStore();
            const intentExecutor = new IntentExecutor(store);
            createBridge(view, store, intentExecutor);

            setter(createMultiPointSelection([{ id: "A", __uniqueId: 1 }]));
            await flushMicrotasks();

            store.dispatch(
                paramProvenanceSlice.actions.paramChange({
                    selector: { scope: [], param: "other" },
                    value: { type: "value", value: 2 },
                })
            );
            await flushMicrotasks();

            setter(createMultiPointSelection([{ id: "B", __uniqueId: 2 }]));
            await flushMicrotasks();

            setter(createMultiPointSelection());
            await flushMicrotasks();

            vi.advanceTimersByTime(200);
            await flushMicrotasks();

            const entry =
                store.getState().provenance.present.paramProvenance.entries[
                    makeParamSelectorKey({ scope: [], param: "selection" })
                ];
            expect(entry.value).toEqual({
                type: "point",
                keyFields: ["id"],
                keys: [],
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it("reapplies selections when data becomes available", async () => {
        const view = new FakeView();
        view.encoding = { key: { field: "id" } };
        view.paramRuntime.registerParam({
            name: "selection",
            select: { type: "point" },
        });

        const datum = { id: "A", __uniqueId: 1 };
        const collector = new FakeCollector((fields, tuple) =>
            tuple[0] === "A" ? datum : undefined
        );
        collector.completed = false;
        view.getCollector = () => collector;

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        createBridge(view, store, intentExecutor);

        store.dispatch(
            paramProvenanceSlice.actions.paramChange({
                selector: { scope: [], param: "selection" },
                value: { type: "point", keyFields: ["id"], keys: [["A"]] },
            })
        );

        await flushMicrotasks();
        expect(view.paramRuntime.getValue("selection").data.size).toBe(0);

        collector.completed = true;
        collector.notify();
        await flushMicrotasks();

        expect(view.paramRuntime.getValue("selection").data.has(1)).toBe(true);
    });

    it("does not dispatch new actions when applying provenance", async () => {
        const view = new FakeView();
        view.paramRuntime.registerParam({
            name: "alpha",
            value: 0,
            bind: { input: "range" },
        });

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        createBridge(view, store, intentExecutor);

        store.dispatch(
            paramProvenanceSlice.actions.paramChange({
                selector: { scope: [], param: "alpha" },
                value: { type: "value", value: 1 },
            })
        );

        await flushMicrotasks();

        expect(store.getState().provenance.past.length).toBe(0);
        expect(view.paramRuntime.getValue("alpha")).toBe(1);
    });
});
