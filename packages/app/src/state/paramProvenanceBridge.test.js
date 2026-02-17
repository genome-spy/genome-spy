// @ts-check
import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";
import ViewParamRuntime from "@genome-spy/core/paramRuntime/viewParamRuntime.js";
import {
    createIntervalSelection,
    createMultiPointSelection,
} from "@genome-spy/core/selection/selection.js";
import { createProvenanceReducer } from "./provenanceReducerBuilder.js";
import { paramProvenanceSlice } from "./paramProvenanceSlice.js";
import ParamProvenanceBridge from "./paramProvenanceBridge.js";
import IntentExecutor from "./intentExecutor.js";
import { makeParamSelectorKey } from "@genome-spy/core/view/viewSelectors.js";
import { flushMicrotasks } from "./testUtils.js";
import templateResultToString from "../utils/templateResultToString.js";

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

    constructor(resolver) {
        this.#resolver = resolver;
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
}

class FakeView {
    constructor() {
        this.paramRuntime = new ViewParamRuntime();
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

        const datum = { id: "A", _uniqueId: 1 };
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
                { sampleId: "S1", chrom: "chr1", pos: 10, _uniqueId: 1 },
                { sampleId: "S2", chrom: "chr2", pos: 20, _uniqueId: 2 },
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

        setter(createMultiPointSelection([{ id: "A", _uniqueId: 1 }]));
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
            createMultiPointSelection([{ name: "duplicate-id", _uniqueId: 1 }])
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
                return { id: "A", _uniqueId: 1 };
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

        setter(createMultiPointSelection([{ id: "A", _uniqueId: 1 }]));
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

            setter(createMultiPointSelection([{ id: "A", _uniqueId: 1 }]));
            await flushMicrotasks();

            store.dispatch(
                paramProvenanceSlice.actions.paramChange({
                    selector: { scope: [], param: "other" },
                    value: { type: "value", value: 2 },
                })
            );
            await flushMicrotasks();

            setter(createMultiPointSelection([{ id: "B", _uniqueId: 2 }]));
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

        const datum = { id: "A", _uniqueId: 1 };
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
