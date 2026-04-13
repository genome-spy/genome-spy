// @ts-check
import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { describe, expect, it } from "vitest";
import IntentExecutor from "./intentExecutor.js";
import Provenance, { createProvenanceIdMiddleware } from "./provenance.js";
import {
    AUGMENTED_KEY,
    createProvenanceReducer,
} from "./provenanceReducerBuilder.js";

/**
 * @typedef {object} SampleState
 * @prop {number} count
 * @prop {object} [lastPayload]
 */

/** @typedef {{ type: string, payload?: any }} Action */

/**
 * @param {SampleState} state
 * @param {Action} [action]
 * @returns {SampleState}
 */
function sampleReducer(state = { count: 0 }, action = { type: "" }) {
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
        middleware: (getDefaultMiddleware) =>
            getDefaultMiddleware({
                serializableCheck: false,
                immutableCheck: false,
            }).concat(createProvenanceIdMiddleware()),
    });
}

describe("Provenance", () => {
    it("is not empty after a single recorded action", () => {
        const store = createStore();
        const intentExecutor = new IntentExecutor(/** @type {any} */ (store));
        const provenance = new Provenance(store);

        expect(provenance.isEmpty()).toBe(true);

        intentExecutor.dispatch(
            /** @type {any} */ ({
                type: "sample/add",
                payload: { value: 1 },
            })
        );

        expect(provenance.isEmpty()).toBe(false);
    });

    it("exposes action history in order", () => {
        const store = createStore();
        const intentExecutor = new IntentExecutor(/** @type {any} */ (store));
        const provenance = new Provenance(store);

        intentExecutor.dispatch(
            /** @type {any} */ ({
                type: "sample/add",
                payload: { value: 1 },
            })
        );
        intentExecutor.dispatch(
            /** @type {any} */ ({
                type: "sample/add",
                payload: { value: 2 },
            })
        );

        const history = provenance.getActionHistory();
        expect(history.length).toBe(2);
        expect(history[0].type).toBe("sample/add");
        expect(/** @type {any} */ (history[1]).payload).toEqual({ value: 2 });
        expect(history[0].provenanceId).toMatch(/^provenance-\d+$/);
        expect(history[1].provenanceId).toMatch(/^provenance-\d+$/);
        expect(history[0].provenanceId).not.toBe(history[1].provenanceId);
    });

    it("serializes bookmark actions without augmentation data", () => {
        const store = createStore();
        const intentExecutor = new IntentExecutor(/** @type {any} */ (store));
        const provenance = new Provenance(store);

        // Use two actions and verify augmentation data gets stripped.
        intentExecutor.dispatch(
            /** @type {any} */ ({
                type: "sample/add",
                payload: { value: 1, [AUGMENTED_KEY]: { values: { a: 1 } } },
            })
        );
        intentExecutor.dispatch(
            /** @type {any} */ ({
                type: "sample/add",
                payload: { value: 2, [AUGMENTED_KEY]: { values: { b: 2 } } },
            })
        );

        const bookmark = {
            actions: provenance.getBookmarkableActionHistory(),
        };

        const serialized = JSON.parse(JSON.stringify(bookmark));
        expect(serialized.actions.length).toBe(2);
        expect(serialized.actions[0].payload).toEqual({ value: 1 });
        expect(serialized.actions[1].payload).toEqual({ value: 2 });
        expect("provenanceId" in serialized.actions[0]).toBe(false);
        expect("provenanceId" in serialized.actions[1]).toBe(false);
        expect(serialized.actions[0].payload[AUGMENTED_KEY]).toBeUndefined();
        expect(serialized.actions[1].payload[AUGMENTED_KEY]).toBeUndefined();
    });

    it("activates past and future states by provenance id", () => {
        const store = createStore();
        const intentExecutor = new IntentExecutor(/** @type {any} */ (store));
        const provenance = new Provenance(store);

        intentExecutor.dispatch(
            /** @type {any} */ ({
                type: "sample/add",
                payload: { value: 1 },
            })
        );
        intentExecutor.dispatch(
            /** @type {any} */ ({
                type: "sample/add",
                payload: { value: 2 },
            })
        );
        intentExecutor.dispatch(
            /** @type {any} */ ({
                type: "sample/add",
                payload: { value: 3 },
            })
        );

        const history = provenance.getActionHistory();

        // Use provenance ids to jump to the second action (count=2).
        provenance.activateState(history[1].provenanceId);
        expect(store.getState().provenance.present.sample.count).toBe(2);

        provenance.activateState(history[2].provenanceId);
        expect(store.getState().provenance.present.sample.count).toBe(3);
    });

    it("activates the initial state", () => {
        const store = createStore();
        const intentExecutor = new IntentExecutor(/** @type {any} */ (store));
        const provenance = new Provenance(store);

        intentExecutor.dispatch(
            /** @type {any} */ ({
                type: "sample/add",
                payload: { value: 1 },
            })
        );
        intentExecutor.dispatch(
            /** @type {any} */ ({
                type: "sample/add",
                payload: { value: 2 },
            })
        );

        expect(store.getState().provenance.present.sample.count).toBe(2);
        provenance.activateInitialState();
        expect(store.getState().provenance.present.sample.count).toBe(1);
    });
});
