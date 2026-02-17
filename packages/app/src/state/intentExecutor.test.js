// @ts-nocheck
import { describe, expect, it, vi } from "vitest";
import IntentExecutor from "./intentExecutor.js";

/**
 * @typedef {{type: string, payload?: any}} Action
 *
 * @typedef {object} StoreStub
 * @prop {(action: Action) => Action} dispatch
 */

/**
 * @returns {StoreStub}
 */
function createStoreStub() {
    return {
        dispatch: vi.fn((action) => action),
    };
}

describe("IntentExecutor", () => {
    it("applies augmenters in order and returns the dispatched action", () => {
        const store = createStoreStub();
        const executor = new IntentExecutor(/** @type {any} */ (store));

        executor.addActionAugmenter((action) => ({
            ...action,
            payload: { ...action.payload, first: true },
        }));
        executor.addActionAugmenter((action) => ({
            ...action,
            payload: { ...action.payload, second: true },
        }));

        /** @type {import("@reduxjs/toolkit").PayloadAction<{value:number}>} */
        const action = { type: "sample/add", payload: { value: 1 } };

        const result = executor.dispatch(action);

        const dispatched = store.dispatch.mock.calls[0][0];
        expect(dispatched.payload).toEqual({
            value: 1,
            first: true,
            second: true,
        });
        expect(result).toBe(dispatched);
    });

    it("passes non-payload actions through unchanged", () => {
        const store = createStoreStub();
        const executor = new IntentExecutor(/** @type {any} */ (store));

        /** @type {Action} */
        const action = { type: "sample/no-payload" };
        executor.dispatch(action);

        expect(store.dispatch).toHaveBeenCalledWith(action);
    });

    it("dispatches batches in order", () => {
        const store = createStoreStub();
        const executor = new IntentExecutor(/** @type {any} */ (store));

        const actions = [
            { type: "sample/one" },
            { type: "sample/two" },
            { type: "sample/three" },
        ];

        executor.dispatchBatch(actions);

        expect(store.dispatch.mock.calls.map((call) => call[0])).toEqual(
            actions
        );
    });

    it("removes augmenters so they no longer apply", () => {
        const store = createStoreStub();
        const executor = new IntentExecutor(/** @type {any} */ (store));

        const augmenter = (action) => ({
            ...action,
            payload: { ...action.payload, augmented: true },
        });

        executor.addActionAugmenter(augmenter);
        executor.removeActionAugmenter(augmenter);

        executor.dispatch({
            type: "sample/add",
            payload: { value: 1 },
        });

        const dispatched = store.dispatch.mock.calls[0][0];
        expect(dispatched.payload).toEqual({ value: 1 });
    });
});
