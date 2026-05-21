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

    it("adds category and condition values for retainCategoriesByAttribute actions", () => {
        const sampleHierarchy = createSampleHierarchy();

        const action = sampleSlice.actions.retainCategoriesByAttribute({
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "patient",
            },
            condition: {
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "TP53_mutation_count",
                },
                operator: "gt",
                operand: 0,
            },
        });

        const augmented = augmentAttributeAction(
            action,
            sampleHierarchy,
            (attribute) => {
                if (attribute.specifier === "patient") {
                    return /** @type {any} */ ({
                        name: "patient",
                        accessor: (sampleId) =>
                            sampleId === "s1" ? "p1" : "p2",
                    });
                } else {
                    return /** @type {any} */ ({
                        name: "TP53_mutation_count",
                        accessor: (sampleId) => (sampleId === "s2" ? 1 : 0),
                    });
                }
            }
        );

        const augmentedAttribute = /** @type {AugmentedAttribute} */ (
            augmented.payload[AUGMENTED_KEY]
        );
        expect(augmentedAttribute.values).toEqual({
            s1: "p1",
            s2: "p2",
        });
        expect(augmentedAttribute.conditionValues).toEqual({
            s1: 0,
            s2: 1,
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
                    name: "count(value)",
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
    it("fails when removing a group before samples have been grouped", () => {
        const state = createSampleHierarchy();

        expect(() =>
            sampleSlice.reducer(
                state,
                sampleSlice.actions.removeGroup({ path: ["A"] })
            )
        ).toThrow("Cannot remove sample groups before grouping.");
    });

    it("fails when threshold group title count is wrong", () => {
        const state = createSampleHierarchy();

        expect(() =>
            sampleSlice.reducer(
                state,
                sampleSlice.actions.groupByThresholds({
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "purity",
                    },
                    thresholds: [{ operator: "lt", operand: 2 }],
                    groupTitles: ["Low"],
                    [AUGMENTED_KEY]: {
                        values: {
                            s1: 1,
                            s2: 3,
                        },
                    },
                })
            )
        ).toThrow("Expected 2 threshold group titles, got 1.");
    });

    it("fails when threshold group titles contain duplicates", () => {
        const state = createSampleHierarchy();

        expect(() =>
            sampleSlice.reducer(
                state,
                sampleSlice.actions.groupByThresholds({
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "purity",
                    },
                    thresholds: [{ operator: "lt", operand: 2 }],
                    groupTitles: ["Low", " Low "],
                    [AUGMENTED_KEY]: {
                        values: {
                            s1: 1,
                            s2: 3,
                        },
                    },
                })
            )
        ).toThrow('Duplicate threshold group title: "Low".');
    });

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

    it("retains all samples from categories with a matching sample", () => {
        let state = sampleSlice.reducer(
            undefined,
            sampleSlice.actions.setSamples({
                samples: [
                    { id: "s1", displayName: "s1", indexNumber: 0 },
                    { id: "s2", displayName: "s2", indexNumber: 1 },
                    { id: "s3", displayName: "s3", indexNumber: 2 },
                    { id: "s4", displayName: "s4", indexNumber: 3 },
                    { id: "s5", displayName: "s5", indexNumber: 4 },
                ],
            })
        );

        state = sampleSlice.reducer(
            state,
            sampleSlice.actions.retainCategoriesByAttribute({
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "patient",
                },
                condition: {
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "TP53_mutation_count",
                    },
                    operator: "gt",
                    operand: 0,
                },
                [AUGMENTED_KEY]: {
                    values: {
                        s1: "p1",
                        s2: "p1",
                        s3: "p2",
                        s4: "p2",
                        s5: "p3",
                    },
                    conditionValues: {
                        s1: 0,
                        s2: 2,
                        s3: 0,
                        s4: 0,
                        s5: 3,
                    },
                },
            })
        );

        expect(state.rootGroup).toEqual({
            name: "ROOT",
            title: "Root",
            samples: ["s1", "s2", "s5"],
        });
    });

    it("uses matching categories across current groups", () => {
        const state =
            /** @type {import("./sampleState.js").SampleHierarchy} */ ({
                ...createSampleHierarchy(),
                sampleData: {
                    ids: ["s1", "s2", "s3", "s4"],
                    entities: {
                        s1: { id: "s1", displayName: "s1", indexNumber: 0 },
                        s2: { id: "s2", displayName: "s2", indexNumber: 1 },
                        s3: { id: "s3", displayName: "s3", indexNumber: 2 },
                        s4: { id: "s4", displayName: "s4", indexNumber: 3 },
                    },
                },
                groupMetadata: [
                    {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "site",
                        },
                    },
                ],
                rootGroup: {
                    name: "ROOT",
                    title: "Root",
                    groups: [
                        {
                            name: "primary",
                            title: "primary",
                            samples: ["s1", "s3"],
                        },
                        {
                            name: "metastasis",
                            title: "metastasis",
                            samples: ["s2", "s4"],
                        },
                    ],
                },
            });

        const nextState = sampleSlice.reducer(
            state,
            sampleSlice.actions.retainCategoriesByAttribute({
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "patient",
                },
                condition: {
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "TP53_mutation_count",
                    },
                    operator: "gt",
                    operand: 0,
                },
                [AUGMENTED_KEY]: {
                    values: {
                        s1: "p1",
                        s2: "p1",
                        s3: "p2",
                        s4: "p2",
                    },
                    conditionValues: {
                        s1: 0,
                        s2: 1,
                        s3: 0,
                        s4: 0,
                    },
                },
            })
        );

        expect(nextState.rootGroup).toEqual({
            name: "ROOT",
            title: "Root",
            groups: [
                {
                    name: "primary",
                    title: "primary",
                    samples: ["s1"],
                },
                {
                    name: "metastasis",
                    title: "metastasis",
                    samples: ["s2"],
                },
            ],
        });
    });

    it("retains categories with categorical condition matches", () => {
        let state = sampleSlice.reducer(
            undefined,
            sampleSlice.actions.setSamples({
                samples: [
                    { id: "s1", displayName: "s1", indexNumber: 0 },
                    { id: "s2", displayName: "s2", indexNumber: 1 },
                    { id: "s3", displayName: "s3", indexNumber: 2 },
                    { id: "s4", displayName: "s4", indexNumber: 3 },
                ],
            })
        );

        state = sampleSlice.reducer(
            state,
            sampleSlice.actions.retainCategoriesByAttribute({
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "patient",
                },
                condition: {
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "diagnosis",
                    },
                    operator: "in",
                    values: ["AML"],
                },
                [AUGMENTED_KEY]: {
                    values: {
                        s1: "p1",
                        s2: "p1",
                        s3: "p2",
                        s4: "p3",
                    },
                    conditionValues: {
                        s1: "AML",
                        s2: "MDS",
                        s3: "ALL",
                        s4: "AML",
                    },
                },
            })
        );

        expect(state.rootGroup).toEqual({
            name: "ROOT",
            title: "Root",
            samples: ["s1", "s2", "s4"],
        });
    });

    it("retains categories requiring all categorical condition values", () => {
        let state = sampleSlice.reducer(
            undefined,
            sampleSlice.actions.setSamples({
                samples: [
                    { id: "s1", displayName: "s1", indexNumber: 0 },
                    { id: "s2", displayName: "s2", indexNumber: 1 },
                    { id: "s3", displayName: "s3", indexNumber: 2 },
                    { id: "s4", displayName: "s4", indexNumber: 3 },
                    { id: "s5", displayName: "s5", indexNumber: 4 },
                ],
            })
        );

        state = sampleSlice.reducer(
            state,
            sampleSlice.actions.retainCategoriesByAttribute({
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "patient",
                },
                condition: {
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "diagnosis",
                    },
                    operator: "in",
                    values: ["AML", "MDS"],
                    required: "all",
                },
                [AUGMENTED_KEY]: {
                    values: {
                        s1: "p1",
                        s2: "p1",
                        s3: "p2",
                        s4: "p2",
                        s5: "p3",
                    },
                    conditionValues: {
                        s1: "AML",
                        s2: "MDS",
                        s3: "AML",
                        s4: "ALL",
                        s5: "MDS",
                    },
                },
            })
        );

        expect(state.rootGroup).toEqual({
            name: "ROOT",
            title: "Root",
            samples: ["s1", "s2"],
        });
    });

    it("throws if augmented payload is missing for retainCategoriesByAttribute", () => {
        const state = createSampleHierarchy();

        expect(() =>
            sampleSlice.reducer(
                state,
                sampleSlice.actions.retainCategoriesByAttribute({
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "patient",
                    },
                    condition: {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "TP53_mutation_count",
                        },
                        operator: "gt",
                        operand: 0,
                    },
                })
            )
        ).toThrow(
            "No accessed category and condition values provided. Did you remember to use SampleView.dispatchAttributeAction()?"
        );
    });
});
