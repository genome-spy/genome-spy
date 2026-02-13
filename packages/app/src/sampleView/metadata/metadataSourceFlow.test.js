import { describe, expect, it } from "vitest";
import { AUGMENTED_KEY } from "../../state/provenanceReducerBuilder.js";
import { sampleSlice } from "../state/sampleSlice.js";
import { augmentAddMetadataFromSourceAction } from "./metadataSourceFlow.js";

/**
 * @returns {import("../sampleView.js").default}
 */
function createSampleViewStub() {
    return /** @type {import("../sampleView.js").default} */ (
        /** @type {unknown} */ ({
            actions: sampleSlice.actions,
            spec: {
                samples: {
                    metadataSources: [
                        {
                            id: "clinical",
                            backend: {
                                backend: "data",
                                data: {
                                    values: [
                                        { sample: "s1", TP53: 1.2 },
                                        { sample: "s2", TP53: -0.2 },
                                    ],
                                },
                            },
                            defaultAttributeDef: {
                                type: "quantitative",
                            },
                        },
                    ],
                },
            },
            sampleHierarchy: {
                sampleData: {
                    ids: ["s1", "s2"],
                },
            },
            getBaseUrl: () => undefined,
        })
    );
}

describe("augmentAddMetadataFromSourceAction", () => {
    it("augments source actions with metadata payload", async () => {
        const sampleView = createSampleViewStub();
        const action = sampleSlice.actions.addMetadataFromSource({
            sourceId: "clinical",
            columnIds: ["TP53"],
        });

        const augmented = await augmentAddMetadataFromSourceAction(
            action,
            sampleView
        );

        expect(
            augmented.payload[AUGMENTED_KEY].metadata.columnarMetadata
        ).toEqual({
            sample: ["s1", "s2"],
            TP53: [1.2, -0.2],
        });
    });

    it("throws when source cannot be resolved", async () => {
        const sampleView = createSampleViewStub();
        const action = sampleSlice.actions.addMetadataFromSource({
            sourceId: "missing",
            columnIds: ["TP53"],
        });

        await expect(
            augmentAddMetadataFromSourceAction(action, sampleView)
        ).rejects.toThrow('Metadata source "missing" was not found.');
    });

    it("throws when import size exceeds the limit", async () => {
        const sampleView = createSampleViewStub();
        const action = sampleSlice.actions.addMetadataFromSource({
            sourceId: "clinical",
            columnIds: Array.from({ length: 101 }, (_, i) => "col" + i),
        });

        await expect(
            augmentAddMetadataFromSourceAction(action, sampleView)
        ).rejects.toThrow("Metadata import exceeds the column limit (100).");
    });

    it("integrates from augmentation to reducer-applied metadata", async () => {
        const sampleView = createSampleViewStub();
        const action = sampleSlice.actions.addMetadataFromSource({
            sourceId: "clinical",
            columnIds: ["TP53"],
        });

        const augmented = await augmentAddMetadataFromSourceAction(
            action,
            sampleView
        );

        let state = sampleSlice.reducer(
            undefined,
            sampleSlice.actions.setSamples({
                samples: [
                    { id: "s1", displayName: "s1", indexNumber: 0 },
                    { id: "s2", displayName: "s2", indexNumber: 1 },
                ],
            })
        );
        state = sampleSlice.reducer(state, augmented);

        expect(state.sampleMetadata.attributeNames).toEqual(["TP53"]);
        expect(state.sampleMetadata.entities.s1.TP53).toBe(1.2);
        expect(state.sampleMetadata.entities.s2.TP53).toBe(-0.2);
    });
});
