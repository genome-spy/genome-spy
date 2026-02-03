import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { describe, expect, it } from "vitest";
import IntentExecutor from "./intentExecutor.js";
import Provenance from "./provenance.js";
import {
    AUGMENTED_KEY,
    createProvenanceReducer,
} from "./provenanceReducerBuilder.js";

/**
 * @typedef {object} SampleState
 * @prop {number} count
 * @prop {object} [lastPayload]
 */

/**
 * @param {SampleState} [state]
 * @param {import("@reduxjs/toolkit").Action} action
 * @returns {SampleState}
 */
function sampleReducer(state = { count: 0 }, action) {
    if (action.type == "sample/add") {
        return {
            count: state.count + 1,
            lastPayload: action.payload,
        };
    }
    return state;
}

/**
 * @returns {import("@reduxjs/toolkit").EnhancedStore<any, any, any>}
 */
function createStore() {
    const provenanceReducer = createProvenanceReducer({
        sample: sampleReducer,
    });

    return configureStore({
        reducer: combineReducers({
            provenance: provenanceReducer,
        }),
    });
}

describe("Provenance", () => {
    it("exposes action history in order", () => {
        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        const provenance = new Provenance(store);

        intentExecutor.dispatch({
            type: "sample/add",
            payload: { value: 1 },
        });
        intentExecutor.dispatch({
            type: "sample/add",
            payload: { value: 2 },
        });

        const history = provenance.getActionHistory();
        expect(history.length).toBe(2);
        expect(history[0].type).toBe("sample/add");
        expect(history[1].payload).toEqual({ value: 2 });
    });

    it("serializes bookmark actions without augmentation data", () => {
        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        const provenance = new Provenance(store);

        // Use two actions so bookmarkable history isn't empty (it skips the first).
        intentExecutor.dispatch({
            type: "sample/add",
            payload: { value: 1, [AUGMENTED_KEY]: { values: { a: 1 } } },
        });
        intentExecutor.dispatch({
            type: "sample/add",
            payload: { value: 2, [AUGMENTED_KEY]: { values: { b: 2 } } },
        });

        const bookmark = {
            actions: provenance.getBookmarkableActionHistory(),
        };

        const serialized = JSON.parse(JSON.stringify(bookmark));
        expect(serialized.actions.length).toBe(1);
        expect(serialized.actions[0].payload).toEqual({ value: 2 });
        expect(serialized.actions[0].payload[AUGMENTED_KEY]).toBeUndefined();
    });

    it("activates past and future states by index", () => {
        const store = createStore();
        const intentExecutor = new IntentExecutor(store);
        const provenance = new Provenance(store);

        intentExecutor.dispatch({
            type: "sample/add",
            payload: { value: 1 },
        });
        intentExecutor.dispatch({
            type: "sample/add",
            payload: { value: 2 },
        });
        intentExecutor.dispatch({
            type: "sample/add",
            payload: { value: 3 },
        });

        // Index 1 maps to the second action (count=2) in redux-undo history.
        provenance.activateState(1);
        expect(store.getState().provenance.present.sample.count).toBe(2);

        provenance.activateState(2);
        expect(store.getState().provenance.present.sample.count).toBe(3);
    });
});
