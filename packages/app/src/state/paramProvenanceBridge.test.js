import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";
import ParamMediator from "@genome-spy/core/view/paramMediator.js";
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
        this.paramMediator = new ParamMediator();
        this.explicitName = "root";
        this.spec = {};
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

describe("ParamProvenanceBridge", () => {
    it("captures param changes into provenance", () => {
        const view = new FakeView();
        const setter = view.paramMediator.registerParam({
            name: "threshold",
            value: 1,
            bind: { input: "range" },
        });

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        new ParamProvenanceBridge({
            root: view,
            store,
            intentExecutor,
        });

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
            const setter = view.paramMediator.registerParam({
                name: "brush",
                select: { type: "interval", encodings: ["x"] },
            });

            const store = createStore();
            const intentExecutor = new IntentExecutor(store);
            new ParamProvenanceBridge({
                root: view,
                store,
                intentExecutor,
            });

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
            const setter = view.paramMediator.registerParam({
                name: "alpha",
                value: 0,
                bind: { input: "range" },
            });

            const store = createStore();
            const intentExecutor = new IntentExecutor(store);
            const dispatchSpy = vi.spyOn(intentExecutor, "dispatch");
            new ParamProvenanceBridge({
                root: view,
                store,
                intentExecutor,
            });

            setter(1);
            await flushMicrotasks();

            setter(2);
            setter(3);
            await flushMicrotasks();

            expect(dispatchSpy).toHaveBeenCalledTimes(1);

            vi.advanceTimersByTime(200);
            await flushMicrotasks();

            expect(dispatchSpy).toHaveBeenCalledTimes(2);
            expect(view.paramMediator.getValue("alpha")).toBe(3);
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
        view.paramMediator.registerParam({
            name: "alpha",
            value: 0,
            bind: { input: "range" },
        });

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        new ParamProvenanceBridge({
            root: view,
            store,
            intentExecutor,
        });

        const action = paramProvenanceSlice.actions.paramChange({
            selector: { scope: [], param: "alpha" },
            value: { type: "value", value: 0.75 },
        });
        store.dispatch(action);

        // Non-obvious: bridge applies values on a microtask tick.
        await flushMicrotasks();

        expect(view.paramMediator.getValue("alpha")).toBe(0.75);
    });

    it("serializes point selections using encoding.key", async () => {
        const view = new FakeView();
        view.encoding = { key: { field: "id" } };
        const setter = view.paramMediator.registerParam({
            name: "selection",
            select: { type: "point" },
        });

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        new ParamProvenanceBridge({
            root: view,
            store,
            intentExecutor,
        });

        const datum = { id: "A", _uniqueId: 1 };
        setter(createMultiPointSelection([datum]));

        const key = makeParamSelectorKey({ scope: [], param: "selection" });
        const entry =
            store.getState().provenance.present.paramProvenance.entries[key];
        expect(entry.value).toEqual({
            type: "point",
            keyField: "id",
            keys: ["A"],
        });

        await flushMicrotasks();
    });

    it("warns and skips point selections when encoding.key is missing", async () => {
        const { showMessageDialog } =
            await import("../components/generic/messageDialog.js");

        const view = new FakeView();
        const setter = view.paramMediator.registerParam({
            name: "selection",
            select: { type: "point" },
        });

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        new ParamProvenanceBridge({
            root: view,
            store,
            intentExecutor,
        });

        setter(createMultiPointSelection([{ id: "A", _uniqueId: 1 }]));
        await flushMicrotasks();

        expect(showMessageDialog).toHaveBeenCalled();
        expect(
            Object.keys(
                store.getState().provenance.present.paramProvenance.entries
            )
        ).toHaveLength(0);
    });

    it("restores point selections and warns on unresolved keys", async () => {
        const { showMessageDialog } =
            await import("../components/generic/messageDialog.js");

        const view = new FakeView();
        view.encoding = { key: { field: "id" } };
        view.paramMediator.registerParam({
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
        new ParamProvenanceBridge({
            root: view,
            store,
            intentExecutor,
        });

        store.dispatch(
            paramProvenanceSlice.actions.paramChange({
                selector: { scope: [], param: "selection" },
                value: { type: "point", keyField: "id", keys: ["A", "B"] },
            })
        );

        await flushMicrotasks();

        const selection = view.paramMediator.getValue("selection");
        expect(selection.data.size).toBe(1);
        expect(showMessageDialog).toHaveBeenCalled();
    });

    it("restores interval selections from provenance entries", async () => {
        const view = new FakeView();
        view.paramMediator.registerParam({
            name: "brush",
            select: { type: "interval", encodings: ["x"] },
        });

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        new ParamProvenanceBridge({
            root: view,
            store,
            intentExecutor,
        });

        store.dispatch(
            paramProvenanceSlice.actions.paramChange({
                selector: { scope: [], param: "brush" },
                value: { type: "interval", intervals: { x: [10, 20] } },
            })
        );

        await flushMicrotasks();

        const selection = view.paramMediator.getValue("brush");
        expect(selection.intervals.x).toEqual([10, 20]);
    });

    it("skips clear actions when the selection is already empty", async () => {
        const view = new FakeView();
        view.encoding = { key: { field: "id" } };
        const setter = view.paramMediator.registerParam({
            name: "selection",
            select: { type: "point" },
        });

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        new ParamProvenanceBridge({
            root: view,
            store,
            intentExecutor,
        });

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
        const otherSetter = view.paramMediator.registerParam({
            name: "other",
            value: 1,
            bind: { input: "range" },
        });
        const setter = view.paramMediator.registerParam({
            name: "selection",
            select: { type: "point" },
        });

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        new ParamProvenanceBridge({
            root: view,
            store,
            intentExecutor,
        });

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
            view.paramMediator.registerParam({
                name: "other",
                value: 1,
                bind: { input: "range" },
            });
            const setter = view.paramMediator.registerParam({
                name: "selection",
                select: { type: "point" },
            });

            const store = createStore();
            const intentExecutor = new IntentExecutor(store);
            new ParamProvenanceBridge({
                root: view,
                store,
                intentExecutor,
            });

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
                keyField: "id",
                keys: [],
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it("reapplies selections when data becomes available", async () => {
        const view = new FakeView();
        view.encoding = { key: { field: "id" } };
        view.paramMediator.registerParam({
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
        new ParamProvenanceBridge({
            root: view,
            store,
            intentExecutor,
        });

        store.dispatch(
            paramProvenanceSlice.actions.paramChange({
                selector: { scope: [], param: "selection" },
                value: { type: "point", keyField: "id", keys: ["A"] },
            })
        );

        await flushMicrotasks();
        expect(view.paramMediator.getValue("selection").data.size).toBe(0);

        collector.completed = true;
        collector.notify();
        await flushMicrotasks();

        expect(view.paramMediator.getValue("selection").data.has(1)).toBe(true);
    });

    it("does not dispatch new actions when applying provenance", async () => {
        const view = new FakeView();
        view.paramMediator.registerParam({
            name: "alpha",
            value: 0,
            bind: { input: "range" },
        });

        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        new ParamProvenanceBridge({
            root: view,
            store,
            intentExecutor,
        });

        store.dispatch(
            paramProvenanceSlice.actions.paramChange({
                selector: { scope: [], param: "alpha" },
                value: { type: "value", value: 1 },
            })
        );

        await flushMicrotasks();

        expect(store.getState().provenance.past.length).toBe(0);
        expect(view.paramMediator.getValue("alpha")).toBe(1);
    });
});
