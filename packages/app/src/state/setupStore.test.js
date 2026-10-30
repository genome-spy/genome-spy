// @ts-check
import { describe, expect, it } from "vitest";
import { ActionCreators } from "redux-undo";
import setupStore, { resetCohort } from "./setupStore.js";
import { sampleSlice } from "../sampleView/state/sampleSlice.js";
import { intentStatusSlice } from "./intentStatusSlice.js";
import { paramProvenanceSlice } from "./paramProvenanceSlice.js";
import { viewSettingsSlice } from "../viewSettingsSlice.js";
import { isBaselineAction } from "./provenanceBaseline.js";

describe("setupStore", () => {
    it("resets cohort state and history while retaining independent parameter and view state", () => {
        const store = setupStore();
        store.dispatch(
            sampleSlice.actions.setSamples({
                samples: [{ id: "s1", displayName: "A", indexNumber: 0 }],
            })
        );
        store.dispatch(
            sampleSlice.actions.addMetadata({
                columnarMetadata: { sample: ["s1"], status: ["old"] },
            })
        );
        store.dispatch(ActionCreators.undo());
        store.dispatch(
            viewSettingsSlice.actions.setVisibility({
                key: "annotations",
                visibility: false,
            })
        );
        store.dispatch(
            intentStatusSlice.actions.setError({ error: "Old error" })
        );
        const viewSettings = store.getState().viewSettings;
        const entries = {
            parent: {
                selector: { scope: [], param: "threshold" },
                value: /** @type {const} */ ({ type: "value", value: 3 }),
            },
        };

        store.dispatch(resetCohort(entries));

        const state = store.getState();
        expect(state.provenance.present.sampleView).toEqual(
            sampleSlice.reducer(undefined, { type: "@@INIT" })
        );
        expect(state.provenance.present.paramProvenance.entries).toEqual(
            entries
        );
        expect(state.provenance.past).toEqual([]);
        expect(state.provenance.future).toEqual([]);
        expect(isBaselineAction(state.provenance.present.lastAction)).toBe(
            true
        );
        expect(state.intentStatus).toEqual({ status: "idle" });
        expect(state.viewSettings).toBe(viewSettings);

        // The first action is undoable to this new baseline, never cohort A.
        store.dispatch(
            paramProvenanceSlice.actions.paramChange({
                selector: { scope: [], param: "threshold" },
                value: { type: "value", value: 9 },
            })
        );
        expect(store.getState().provenance.past).toHaveLength(1);
        store.dispatch(ActionCreators.undo());
        expect(
            store.getState().provenance.present.paramProvenance.entries
        ).toEqual(entries);
        expect(
            store.getState().provenance.present.sampleView.sampleData
        ).toBeUndefined();
    });

    it("rolls back to the last successful action on error", () => {
        const store = setupStore();
        // Non-obvious: use provenance indices to mirror pipeline rollback.
        const startIndex = store.getState().provenance.past.length;

        store.dispatch(
            sampleSlice.actions.setSamples({
                samples: [
                    { id: "s1", displayName: "s1", indexNumber: 0 },
                    { id: "s2", displayName: "s2", indexNumber: 1 },
                ],
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

    it("rolls back an agent submission to the batch start and clears the error state", () => {
        const store = setupStore();
        const startIndex = store.getState().provenance.past.length;

        store.dispatch(
            sampleSlice.actions.setSamples({
                samples: [
                    { id: "s1", displayName: "s1", indexNumber: 0 },
                    { id: "s2", displayName: "s2", indexNumber: 1 },
                ],
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

        store.dispatch(
            intentStatusSlice.actions.setError({
                startIndex,
                lastSuccessfulIndex: afterSamples,
                submissionKind: "agent",
                failedAction: sampleSlice.actions.addMetadata({
                    columnarMetadata: {
                        sample: ["s1", "s2"],
                        status: ["ok", "ok"],
                    },
                }),
                error: "Boom",
            })
        );

        expect(store.getState().intentStatus).toMatchObject({
            status: "error",
            submissionKind: "agent",
            startIndex,
        });
        expect(
            store.getState().provenance.present.sampleView.sampleMetadata
                .attributeNames
        ).toEqual([]);

        store.dispatch(intentStatusSlice.actions.clearStatus());
        expect(store.getState().intentStatus).toEqual({ status: "idle" });
    });
});
