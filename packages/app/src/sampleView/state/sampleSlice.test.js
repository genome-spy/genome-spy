// @ts-check
import { describe, expect, it } from "vitest";
import { AUGMENTED_KEY } from "../../state/provenanceReducerBuilder.js";
import {
    SAMPLE_SLICE_NAME,
    augmentAttributeAction,
    sampleSlice,
} from "./sampleSlice.js";
/**
 * @typedef {import("../types.js").AttributeIdentifier} AttributeIdentifier
 * @typedef {import("./payloadTypes.js").AugmentedAttribute} AugmentedAttribute
 */

/**
 * @returns {import("./sampleState.js").SampleHierarchy}
 */
function createSampleHierarchy() {
    return {
        sampleData: {
            ids: ["s1", "s2"],
            entities: {
                s1: { id: "s1", displayName: "s1", indexNumber: 0 },
                s2: { id: "s2", displayName: "s2", indexNumber: 1 },
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

/**
 * @param {import("../types.js").AggregationOp} op
 * @returns {AttributeIdentifier}
 */
function createIntervalAttribute(op) {
    return {
        type: "VALUE_AT_LOCUS",
        specifier: {
            view: "track",
            field: "value",
            interval: [1, 2],
            aggregation: { op },
        },
    };
}

describe("augmentAttributeAction", () => {
    it("adds accessed values without mutating the original action", () => {
        const sampleHierarchy = createSampleHierarchy();

        const action = {
            type: `${SAMPLE_SLICE_NAME}/filterByNominal`,
            payload: {
                attribute: /** @type {AttributeIdentifier} */ ({
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "status",
                }),
                values: ["A"],
                remove: false,
            },
        };

        // Attribute accessor uses sample ids to provide a deterministic mapping.
        const augmented = augmentAttributeAction(
            action,
            sampleHierarchy,
            () =>
                /** @type {any} */ ({
                    name: "status",
                    accessor: (sampleId) => (sampleId == "s1" ? "A" : "B"),
                })
        );

        expect(augmented).not.toBe(action);
        const augmentedAttribute = /** @type {AugmentedAttribute} */ (
            augmented.payload[AUGMENTED_KEY]
        );
        expect(augmentedAttribute.values).toEqual({
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
                attribute: /** @type {AttributeIdentifier} */ ({
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "status",
                }),
            },
        };

        const augmented = augmentAttributeAction(
            action,
            sampleHierarchy,
            () =>
                /** @type {any} */ ({
                    name: "status",
                    accessor: (sampleId) => (sampleId == "s1" ? "A" : "B"),
                    scale: {
                        domain: () => ["A", "B"],
                    },
                })
        );

        const augmentedAttribute = /** @type {AugmentedAttribute} */ (
            augmented.payload[AUGMENTED_KEY]
        );
        expect(augmentedAttribute.domain).toEqual(["A", "B"]);
    });

    it("adds derived metadata payload for deriveMetadata actions", () => {
        const sampleHierarchy = createSampleHierarchy();

        const action = /** @type {any} */ ({
            type: `${SAMPLE_SLICE_NAME}/deriveMetadata`,
            payload: {
                attribute: { type: "VALUE_AT_LOCUS", specifier: "x" },
                name: "derived",
                groupPath: "group/sub",
                scale: { scheme: "viridis" },
            },
        });

        const augmented = augmentAttributeAction(
            action,
            sampleHierarchy,
            () =>
                /** @type {any} */ ({
                    name: "x",
                    type: "quantitative",
                    valuesProvider: ({ sampleIds }) =>
                        sampleIds.map((id) => (id === "s1" ? 1 : 2)),
                })
        );

        const augmentedAttribute = /** @type {any} */ (
            augmented.payload[AUGMENTED_KEY]
        );
        expect(augmentedAttribute.metadata).toEqual({
            columnarMetadata: {
                sample: ["s1", "s2"],
                "group/sub/derived": [1, 2],
            },
            attributeDefs: {
                "group/sub/derived": {
                    type: "quantitative",
                    scale: { scheme: "viridis" },
                },
            },
        });
    });

    it("inherits authored source scale for domain-preserving derived metadata", () => {
        const sampleHierarchy = createSampleHierarchy();

        const action = {
            type: `${SAMPLE_SLICE_NAME}/deriveMetadata`,
            payload: {
                attribute: createIntervalAttribute("weightedMean"),
                name: "derived",
            },
        };

        const augmented = augmentAttributeAction(
            action,
            sampleHierarchy,
            () =>
                /** @type {any} */ ({
                    attribute: action.payload.attribute,
                    name: "weighted mean(value)",
                    type: "quantitative",
                    scaleSpec: { domainMid: 0 },
                    scale: {
                        props: {
                            type: "linear",
                            scheme: "viridis",
                            domainMid: 0,
                        },
                    },
                    valuesProvider: ({ sampleIds }) =>
                        sampleIds.map((id) => (id === "s1" ? -1 : 2)),
                })
        );

        const augmentedAttribute = /** @type {any} */ (
            augmented.payload[AUGMENTED_KEY]
        );
        expect(augmentedAttribute.metadata.attributeDefs.derived).toEqual({
            type: "quantitative",
            scale: { domainMid: 0 },
        });
    });

    it("omits inherited scale for non-preserving derived metadata", () => {
        const sampleHierarchy = createSampleHierarchy();

        const action = {
            type: `${SAMPLE_SLICE_NAME}/deriveMetadata`,
            payload: {
                attribute: createIntervalAttribute("count"),
                name: "derived",
            },
        };

        const augmented = augmentAttributeAction(
            action,
            sampleHierarchy,
            () =>
                /** @type {any} */ ({
                    attribute: action.payload.attribute,
                    name: "item count",
                    type: "quantitative",
                    scaleSpec: { domainMid: 0 },
                    valuesProvider: ({ sampleIds }) =>
                        sampleIds.map((id) => (id === "s1" ? 1 : 2)),
                })
        );

        const augmentedAttribute = /** @type {any} */ (
            augmented.payload[AUGMENTED_KEY]
        );
        expect(augmentedAttribute.metadata.attributeDefs.derived).toEqual({
            type: "quantitative",
        });
    });

    it("uses explicit derived metadata scale overrides", () => {
        const sampleHierarchy = createSampleHierarchy();

        const action = {
            type: `${SAMPLE_SLICE_NAME}/deriveMetadata`,
            payload: {
                attribute: createIntervalAttribute("weightedMean"),
                name: "derived",
                scale: { scheme: "magma" },
            },
        };

        const augmented = augmentAttributeAction(
            action,
            sampleHierarchy,
            () =>
                /** @type {any} */ ({
                    attribute: action.payload.attribute,
                    name: "weighted mean(value)",
                    type: "quantitative",
                    scaleSpec: { domainMid: 0 },
                    valuesProvider: ({ sampleIds }) =>
                        sampleIds.map((id) => (id === "s1" ? 1 : 2)),
                })
        );

        const augmentedAttribute = /** @type {any} */ (
            augmented.payload[AUGMENTED_KEY]
        );
        expect(augmentedAttribute.metadata.attributeDefs.derived).toEqual({
            type: "quantitative",
            scale: { scheme: "magma" },
        });
    });

    it("allows derived metadata actions to force automatic scale inference", () => {
        const sampleHierarchy = createSampleHierarchy();

        const action = {
            type: `${SAMPLE_SLICE_NAME}/deriveMetadata`,
            payload: {
                attribute: createIntervalAttribute("weightedMean"),
                name: "derived",
                scale: null,
            },
        };

        const augmented = augmentAttributeAction(
            action,
            sampleHierarchy,
            () =>
                /** @type {any} */ ({
                    attribute: action.payload.attribute,
                    name: "weighted mean(value)",
                    type: "quantitative",
                    scaleSpec: { domainMid: 0 },
                    valuesProvider: ({ sampleIds }) =>
                        sampleIds.map((id) => (id === "s1" ? 1 : 2)),
                })
        );

        const augmentedAttribute = /** @type {any} */ (
            augmented.payload[AUGMENTED_KEY]
        );
        expect(augmentedAttribute.metadata.attributeDefs.derived).toEqual({
            type: "quantitative",
        });
    });

    it("omits empty derived metadata scale overrides", () => {
        const sampleHierarchy = createSampleHierarchy();

        const action = {
            type: `${SAMPLE_SLICE_NAME}/deriveMetadata`,
            payload: {
                attribute: createIntervalAttribute("weightedMean"),
                name: "derived",
                scale: {},
            },
        };

        const augmented = augmentAttributeAction(
            action,
            sampleHierarchy,
            () =>
                /** @type {any} */ ({
                    attribute: action.payload.attribute,
                    name: "weighted mean(value)",
                    type: "quantitative",
                    scaleSpec: { domainMid: 0 },
                    valuesProvider: ({ sampleIds }) =>
                        sampleIds.map((id) => (id === "s1" ? 1 : 2)),
                })
        );

        const augmentedAttribute = /** @type {any} */ (
            augmented.payload[AUGMENTED_KEY]
        );
        expect(augmentedAttribute.metadata.attributeDefs.derived).toEqual({
            type: "quantitative",
        });
    });
});

describe("sampleSlice reducers", () => {
    it("adds metadata payload for addMetadataFromSource actions", () => {
        let state = sampleSlice.reducer(
            undefined,
            sampleSlice.actions.setSamples({
                samples: [
                    { id: "s1", displayName: "s1", indexNumber: 0 },
                    { id: "s2", displayName: "s2", indexNumber: 1 },
                ],
            })
        );

        state = sampleSlice.reducer(
            state,
            sampleSlice.actions.addMetadataFromSource({
                sourceId: "rna_expression",
                columnIds: ["TP53"],
                [AUGMENTED_KEY]: {
                    metadata: {
                        columnarMetadata: {
                            sample: ["s1", "s2"],
                            TP53: [1.2, -0.3],
                        },
                        attributeDefs: {
                            TP53: {
                                type: "quantitative",
                            },
                        },
                    },
                },
            })
        );

        expect(state.sampleMetadata.attributeNames).toEqual(["TP53"]);
        expect(state.sampleMetadata.entities.s1.TP53).toBe(1.2);
        expect(state.sampleMetadata.entities.s2.TP53).toBe(-0.3);
    });

    it("throws if augmented payload is missing for addMetadataFromSource", () => {
        const state = sampleSlice.reducer(
            undefined,
            sampleSlice.actions.setSamples({
                samples: [
                    { id: "s1", displayName: "s1", indexNumber: 0 },
                    { id: "s2", displayName: "s2", indexNumber: 1 },
                ],
            })
        );

        expect(() =>
            sampleSlice.reducer(
                state,
                sampleSlice.actions.addMetadataFromSource({
                    sourceId: "rna_expression",
                    columnIds: ["TP53"],
                })
            )
        ).toThrow(
            "Metadata source payload is missing. Did you remember to use IntentExecutor.dispatch()?"
        );
    });
});
