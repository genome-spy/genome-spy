import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { describe, expect, it } from "vitest";
import ParamMediator from "@genome-spy/core/view/paramMediator.js";
import { createProvenanceReducer } from "./provenanceReducerBuilder.js";
import { paramProvenanceSlice } from "./paramProvenanceSlice.js";
import ParamProvenanceBridge from "./paramProvenanceBridge.js";
import IntentExecutor from "./intentExecutor.js";
import { makeParamSelectorKey } from "@genome-spy/core/view/viewSelectors.js";

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
        await new Promise((resolve) => queueMicrotask(resolve));

        expect(view.paramMediator.getValue("alpha")).toBe(0.75);
    });
});
