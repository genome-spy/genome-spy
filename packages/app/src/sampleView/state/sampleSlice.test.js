import { describe, expect, it } from "vitest";
import { AUGMENTED_KEY } from "../../state/provenanceReducerBuilder.js";
import { SAMPLE_SLICE_NAME, augmentAttributeAction } from "./sampleSlice.js";

/**
 * @returns {import("./sampleState.js").SampleHierarchy}
 */
function createSampleHierarchy() {
    return {
        sampleData: {
            ids: ["s1", "s2"],
            entities: {
                s1: { id: "s1" },
                s2: { id: "s2" },
            },
        },
        sampleMetadata: {
            entities: {},
            attributeNames: [],
        },
        groupMetadata: [],
        rootGroup: {
            name: "ROOT",
            title: "Root",
            samples: ["s1", "s2"],
        },
    };
}

describe("augmentAttributeAction", () => {
    it("adds accessed values without mutating the original action", () => {
        const sampleHierarchy = createSampleHierarchy();

        const action = {
            type: `${SAMPLE_SLICE_NAME}/filterByNominal`,
            payload: {
                attribute: "status",
                values: ["A"],
                remove: false,
            },
        };

        // Attribute accessor uses sample ids to provide a deterministic mapping.
        const augmented = augmentAttributeAction(
            action,
            sampleHierarchy,
            () => ({
                name: "status",
                accessor: (sampleId) => (sampleId == "s1" ? "A" : "B"),
            })
        );

        expect(augmented).not.toBe(action);
        expect(augmented.payload[AUGMENTED_KEY].values).toEqual({
            s1: "A",
            s2: "B",
        });
        expect(action.payload[AUGMENTED_KEY]).toBeUndefined();
    });

    it("adds domain information for groupByNominal actions", () => {
        const sampleHierarchy = createSampleHierarchy();

        const action = {
            type: `${SAMPLE_SLICE_NAME}/groupByNominal`,
            payload: {
                attribute: "status",
            },
        };

        const augmented = augmentAttributeAction(
            action,
            sampleHierarchy,
            () => ({
                name: "status",
                accessor: (sampleId) => (sampleId == "s1" ? "A" : "B"),
                scale: {
                    domain: () => ["A", "B"],
                },
            })
        );

        expect(augmented.payload[AUGMENTED_KEY].domain).toEqual(["A", "B"]);
    });
});
