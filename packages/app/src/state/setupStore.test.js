// @ts-nocheck
import { describe, expect, it } from "vitest";
import setupStore from "./setupStore.js";
import { sampleSlice } from "../sampleView/state/sampleSlice.js";
import { intentStatusSlice } from "./intentStatusSlice.js";

describe("setupStore", () => {
    it("rolls back to the last successful action on error", () => {
        const store = setupStore();
        // Non-obvious: use provenance indices to mirror pipeline rollback.
        const startIndex = store.getState().provenance.past.length;

        store.dispatch(
            sampleSlice.actions.setSamples({
                samples: [{ id: "s1" }, { id: "s2" }],
            })
        );
        const afterSamples = store.getState().provenance.past.length;

        store.dispatch(
            sampleSlice.actions.addMetadata({
                columnarMetadata: {
                    sample: ["s1", "s2"],
                    status: ["ok", "ok"],
                },
            })
        );
        const afterMetadata = store.getState().provenance.past.length;
        expect(afterMetadata).toBeGreaterThan(afterSamples);

        store.dispatch(
            intentStatusSlice.actions.setError({
                startIndex,
                lastSuccessfulIndex: afterSamples,
                failedAction: sampleSlice.actions.addMetadata({
                    columnarMetadata: {
                        sample: ["s1", "s2"],
                        status: ["ok", "ok"],
                    },
                }),
                error: "Boom",
            })
        );

        const { sampleMetadata } =
            store.getState().provenance.present.sampleView;
        expect(sampleMetadata.attributeNames).toEqual([]);
    });
});
