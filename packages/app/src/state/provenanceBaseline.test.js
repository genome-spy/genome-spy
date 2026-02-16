import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { describe, expect, it } from "vitest";
import { ActionCreators } from "redux-undo";
import IntentExecutor from "./intentExecutor.js";
import Provenance from "./provenance.js";
import { sampleSlice } from "../sampleView/state/sampleSlice.js";
import { createProvenanceReducer } from "./provenanceReducerBuilder.js";
import { resetProvenanceHistory } from "./provenanceBaseline.js";

/**
 * @returns {import("@reduxjs/toolkit").EnhancedStore<any, any, any>}
 */
function createStore() {
    const provenanceReducer = createProvenanceReducer({
        [sampleSlice.name]: sampleSlice.reducer,
    });

    return configureStore({
        reducer: combineReducers({
            provenance: provenanceReducer,
        }),
    });
}

describe("resetProvenanceHistory", () => {
    it("makes the next action immediately undoable", () => {
        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        const provenance = new Provenance(store);

        intentExecutor.dispatch(
            sampleSlice.actions.setSamples({
                samples: [{ id: "s1", displayName: "s1", indexNumber: 0 }],
            })
        );
        intentExecutor.dispatch(
            sampleSlice.actions.addMetadata({
                columnarMetadata: {
                    sample: ["s1"],
                    a: [1],
                },
            })
        );

        resetProvenanceHistory(store, sampleSlice.name);

        intentExecutor.dispatch(
            sampleSlice.actions.addMetadata({
                columnarMetadata: {
                    sample: ["s1"],
                    b: [2],
                },
            })
        );

        expect(provenance.isUndoable()).toBe(true);
        expect(store.getState().provenance.past.length).toBe(1);
    });

    it("keeps bookmarkable history free of baseline marker actions", () => {
        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        const provenance = new Provenance(store);

        intentExecutor.dispatch(
            sampleSlice.actions.setSamples({
                samples: [{ id: "s1", displayName: "s1", indexNumber: 0 }],
            })
        );
        resetProvenanceHistory(store, sampleSlice.name);

        intentExecutor.dispatch(
            sampleSlice.actions.addMetadata({
                columnarMetadata: {
                    sample: ["s1"],
                    c: [3],
                },
            })
        );

        const bookmarkable = provenance.getBookmarkableActionHistory();
        expect(bookmarkable.length).toBe(1);
        expect(bookmarkable[0].type).toBe(sampleSlice.actions.addMetadata.type);
    });

    it("restores eager metadata when undoing a later user action", () => {
        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        const provenance = new Provenance(store);

        intentExecutor.dispatch(
            sampleSlice.actions.setSamples({
                samples: [{ id: "s1", displayName: "s1", indexNumber: 0 }],
            })
        );
        intentExecutor.dispatch(
            sampleSlice.actions.addMetadata({
                columnarMetadata: {
                    sample: ["s1"],
                    eager: [1],
                },
                replace: true,
            })
        );

        resetProvenanceHistory(store, sampleSlice.name);

        intentExecutor.dispatch(
            sampleSlice.actions.addMetadata({
                columnarMetadata: {
                    sample: ["s1"],
                    user: [2],
                },
            })
        );

        store.dispatch(ActionCreators.undo());

        const state = store.getState().provenance.present.sampleView;
        expect(state.sampleMetadata.attributeNames).toEqual(["eager"]);
        expect(state.sampleMetadata.entities.s1.eager).toBe(1);
    });
});
