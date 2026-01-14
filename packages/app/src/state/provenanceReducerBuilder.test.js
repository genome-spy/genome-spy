import { describe, expect, it } from "vitest";
import {
    AUGMENTED_KEY,
    createProvenanceReducer,
    makeFilterAction,
    stripAugmentation,
} from "./provenanceReducerBuilder.js";

/**
 * @typedef {object} SampleState
 * @prop {number} count
 */

/**
 * @param {SampleState} [state]
 * @param {import("@reduxjs/toolkit").Action} action
 * @returns {SampleState}
 */
function sampleReducer(state = { count: 0 }, action) {
    if (action.type == "sample/inc") {
        return { count: state.count + 1 };
    }
    return state;
}

describe("makeFilterAction", () => {
    it("matches actions by reducer key prefix", () => {
        const filter = makeFilterAction({ sample: sampleReducer });

        expect(filter({ type: "sample/inc" })).toBe(true);
        expect(filter({ type: "other/inc" })).toBe(false);
    });
});

describe("stripAugmentation", () => {
    it("removes the augmented payload from actions", () => {
        const action = {
            type: "sample/inc",
            payload: { value: 1, [AUGMENTED_KEY]: { values: { a: 1 } } },
        };

        const stripped = stripAugmentation(action);

        expect(stripped.payload).toEqual({ value: 1 });
        expect(action.payload[AUGMENTED_KEY]).toEqual({ values: { a: 1 } });
    });
});

describe("createProvenanceReducer", () => {
    it("records lastAction without augmentation data", () => {
        const reducer = createProvenanceReducer({ sample: sampleReducer });

        let state = reducer(undefined, { type: "@@INIT" });
        state = reducer(state, {
            type: "sample/inc",
            payload: { value: 1, [AUGMENTED_KEY]: { values: { a: 1 } } },
        });

        expect(state.present.sample.count).toBe(1);
        expect(state.present.lastAction.payload).toEqual({ value: 1 });
    });
});
