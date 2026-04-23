import {
    createSelector,
    createSlice,
    freeze,
    original,
} from "@reduxjs/toolkit";
import { peek } from "@genome-spy/core/utils/arrayUtils.js";
import {
    groupSamplesByAccessor,
    groupSamplesByQuartiles,
    groupSamplesByThresholds,
    makeCustomGroupAccessor,
    removeGroup,
} from "./groupOperations.js";
import {
    filterNominal,
    filterQuantitative,
    filterUndefined,
    getMatchedValues,
    retainFirstNCategories,
    retainFirstOfEachCategory,
    sort,
    wrapAccessorForComparison,
} from "./sampleOperations.js";
import { AUGMENTED_KEY } from "../../state/provenanceReducerBuilder.js";
import {
    applyGroupToAttributeDefs,
    applyGroupToColumnarMetadata,
    combineSampleMetadata,
    computeAttributeDefs,
    METADATA_PATH_SEPARATOR,
} from "../metadata/metadataUtils.js";
import { resolveDataType } from "../metadata/deriveMetadataUtils.js";
import { columnsToRows } from "../../utils/dataLayout.js";
import emptyToUndefined from "../../utils/emptyToUndefined.js";

/**
 * @typedef {import("./sampleState.js").SampleHierarchy} SampleHierarchy
 * @typedef {import("./sampleState.js").Group} Group
 * @typedef {import("./sampleState.js").SampleGroup} SampleGroup
 * @typedef {import("./sampleState.js").GroupGroup} GroupGroup
 *
 * @typedef {import("./payloadTypes.js").PayloadWithAttribute} PayloadWithAttribute
 */

/**
 * @template P
 * @typedef {import("@reduxjs/toolkit").PayloadAction<P>} PayloadAction
 */

export const SAMPLE_SLICE_NAME = "sampleView";

/**
 * @returns {SampleHierarchy}
 */
function createInitialState() {
    return {
        sampleData: undefined,
        sampleMetadata: {
            entities: {},
            attributeNames: [],
        },
        groupMetadata: [],
        rootGroup: {
            name: "ROOT",
            title: "Root",
            samples: [],
        },
    };
}

/**
 * @param {PayloadAction<PayloadWithAttribute>} action
 * @returns {function(string):any}
 */
function createObjectAccessor(action) {
    // Attribute-related reducers require accessed values from the augmenter.
    const obj = action.payload[AUGMENTED_KEY]?.values;
    if (!obj) {
        throw new Error(
            "No accessed values provided. Did you remember to use SampleView.dispatchAttributeAction()?"
        );
    }
    return (sampleId) => obj[sampleId];
}

/**
 * @param {SampleHierarchy} state
 * @param {import("./payloadTypes.js").SetMetadata} payload
 */
function applyMetadataPayload(state, payload) {
    if (!state.sampleData) {
        throw new Error("Samples must be set before setting metadata!");
    }

    const columnarMetadata = payload.columnarMetadata;

    const attributeNames =
        /** @type {import("./payloadTypes.js").AttributeName[]} */ (
            Object.keys(columnarMetadata).filter((k) => k !== "sample")
        );

    const entities = Object.fromEntries(
        columnsToRows(columnarMetadata).map((record) => {
            const { sample, ...rest } = record;
            return [String(sample), rest];
        })
    );

    /** @type {import("./sampleState.js").SampleMetadata} */
    const sampleMetadata = { entities, attributeNames };

    // Complete attribute definitions by inferring missing fields.
    const completedAttributeDefs = computeAttributeDefs(
        sampleMetadata,
        payload.attributeDefs,
        METADATA_PATH_SEPARATOR
    );

    const newMetadata = {
        ...sampleMetadata,
        attributeDefs: completedAttributeDefs,
    };

    const baseSampleMetadata =
        original(state.sampleMetadata) ?? state.sampleMetadata;
    const combinedMetadata = payload.replace
        ? newMetadata
        : combineSampleMetadata(baseSampleMetadata, newMetadata);

    state.sampleMetadata = payload.replace
        ? freeze(newMetadata)
        : freeze(combinedMetadata);
}

/**
 * @typedef {keyof typeof sampleSlice.actions} SampleActionType
 */
export const sampleSlice = createSlice({
    name: SAMPLE_SLICE_NAME,
    initialState: createInitialState(),
    reducers: {
        /**
         * Install the initial sample collection for this view.
         *
         * Use this when samples are first loaded or the entire collection is
         * replaced.
         *
         * @agent.payloadType SetSamples
         * @agent.category initialization
         * @agent.ignore true
         */
        setSamples: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").SetSamples>} */ action
        ) => {
            const samples = action.payload.samples;

            if (state.sampleData) {
                throw new Error("Samples have already been set!");
            }

            if (
                samples.some(
                    (sample) => sample.id === undefined || sample.id === null
                )
            ) {
                throw new Error(
                    'The sample data contains missing sample ids or the "sample" column is missing!'
                );
            }

            if (
                new Set(samples.map((sample) => sample.id)).size !=
                samples.length
            ) {
                throw new Error(
                    "The sample data contains duplicate sample ids!"
                );
            }

            const samplesWithIndices = samples.map((sample, index) => ({
                ...sample,
                indexNumber: index,
            }));

            state.sampleData = {
                ids: samplesWithIndices.map((sample) => sample.id),
                entities: Object.fromEntries(
                    samplesWithIndices.map((sample) => [sample.id, sample])
                ),
            };

            state.rootGroup = {
                name: "ROOT",
                title: "Root",
                samples: state.sampleData.ids,
            };
        },

        /**
         * Add sample metadata columns from a columnar payload.
         *
         * Use this to attach new metadata columns to the current samples or
         * replace the current metadata set with uploaded values.
         *
         * @agent.payloadType SetMetadata
         * @agent.category metadata
         * @example
         * {
         *   "columnarMetadata": {
         *     "sample": ["s1", "s2"],
         *     "diagnosis": ["AML", "ALL"]
         *   }
         * }
         */
        addMetadata: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").SetMetadata>} */ action
        ) => {
            applyMetadataPayload(state, action.payload);
        },

        /**
         * Add a derived metadata column from a selected or aggregated attribute.
         *
         * Use this when an existing attribute should be materialized as sample
         * metadata under a new column name.
         *
         * @agent.payloadType DeriveMetadata
         * @agent.category metadata
         * @agent.requiresAttribute true
         * @example
         * {
         *   "attribute": { "type": "SAMPLE_ATTRIBUTE", "specifier": "purity" },
         *   "name": "purity_copy"
         * }
         */
        deriveMetadata: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").DeriveMetadata>} */ action
        ) => {
            const metadata = action.payload[AUGMENTED_KEY]?.metadata;
            if (!metadata) {
                throw new Error(
                    "Derived metadata payload is missing. Did you remember to use IntentExecutor.dispatch()?"
                );
            }

            applyMetadataPayload(state, metadata);
        },

        /**
         * Import metadata columns from a configured source.
         *
         * Use this when one or more source-backed metadata columns should be
         * added to the current sample collection.
         *
         * @agent.payloadType AddMetadataFromSource
         * @agent.category metadata
         * @example
         * {
         *   "columnIds": ["diagnosis", "stage"]
         * }
         */
        addMetadataFromSource: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").AddMetadataFromSource>} */ action
        ) => {
            const metadata = action.payload[AUGMENTED_KEY]?.metadata;
            if (!metadata) {
                throw new Error(
                    "Metadata source payload is missing. Did you remember to use IntentExecutor.dispatch()?"
                );
            }

            applyMetadataPayload(state, metadata);
        },

        /**
         * Sort samples in descending order by a selected attribute.
         *
         * Use this when samples should be ranked by one quantitative or
         * ordinal attribute before further filtering or grouping.
         *
         * @agent.payloadType SortBy
         * @agent.category sorting
         * @agent.requiresAttribute true
         * @agent.attributeKinds quantitative,ordinal
         * @example
         * {
         *   "attribute": { "type": "SAMPLE_ATTRIBUTE", "specifier": "age" }
         * }
         */
        sortBy: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").SortBy>} */ action
        ) => {
            applyToSamples(state, (samples) =>
                sort(samples, createObjectAccessor(action), true)
            );
        },

        /**
         * Retain the first sample for each distinct value of a selected attribute.
         *
         * Use this when the current sample order already encodes the desired
         * representative sample within each category and within each current
         * group.
         *
         * @agent.payloadType RetainFirstOfEach
         * @agent.category grouping
         * @agent.requiresAttribute true
         * @agent.attributeKinds nominal,ordinal
         * @example
         * {
         *   "attribute": { "type": "SAMPLE_ATTRIBUTE", "specifier": "patient_id" }
         * }
         */
        retainFirstOfEach: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").RetainFirstOfEach>} */
            action
        ) => {
            applyToSamples(state, (samples) =>
                retainFirstOfEachCategory(samples, createObjectAccessor(action))
            );
        },

        /**
         * Retain samples whose value falls in the first n distinct categories in the current ordering.
         *
         * Use this when samples are already ordered by a ranking attribute and
         * all samples belonging to the first n encountered categories should
         * be kept within each current group.
         *
         * @agent.payloadType RetainFirstNCategories
         * @agent.category grouping
         * @agent.requiresAttribute true
         * @agent.attributeKinds nominal,ordinal
         * @example
         * {
         *   "attribute": { "type": "SAMPLE_ATTRIBUTE", "specifier": "patient_id" },
         *   "n": 5
         * }
         */
        retainFirstNCategories: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").RetainFirstNCategories>} */
            action
        ) => {
            applyToSamples(state, (samples) =>
                retainFirstNCategories(
                    samples,
                    createObjectAccessor(action),
                    action.payload.n
                )
            );
        },

        /**
         * Retain samples whose selected quantitative value satisfies a threshold comparison.
         *
         * Use this for numeric filters such as values greater than, less than,
         * or equal to a chosen threshold.
         *
         * @agent.payloadType FilterByQuantitative
         * @agent.category filtering
         * @agent.requiresAttribute true
         * @agent.attributeKinds quantitative
         * @example
         * {
         *   "attribute": { "type": "SAMPLE_ATTRIBUTE", "specifier": "purity" },
         *   "operator": "gte",
         *   "operand": 0.6
         * }
         */
        filterByQuantitative: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").FilterByQuantitative>} */
            action
        ) => {
            applyToSamples(state, (samples) =>
                filterQuantitative(
                    samples,
                    createObjectAccessor(action),
                    action.payload.operator,
                    action.payload.operand
                )
            );
        },

        /**
         * Retain or remove samples whose selected attribute matches any of the provided values.
         *
         * Use this for exact-match filtering on categorical or ordinal
         * attributes. Set `remove` to `true` to exclude matching samples
         * instead of keeping them.
         *
         * @agent.payloadType FilterByNominal
         * @agent.category filtering
         * @agent.requiresAttribute true
         * @agent.attributeKinds nominal,ordinal
         * @example
         * {
         *   "attribute": { "type": "SAMPLE_ATTRIBUTE", "specifier": "diagnosis" },
         *   "values": ["AML"]
         * }
         */
        filterByNominal: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").FilterByNominal>} */
            action
        ) => {
            applyToSamples(state, (samples) =>
                filterNominal(
                    samples,
                    createObjectAccessor(action),
                    action.payload.remove ? "remove" : "retain",
                    action.payload.values
                )
            );
        },

        /**
         * Remove samples whose selected attribute value is missing.
         *
         * Use this before later analysis steps when samples with `undefined`
         * or `null` values should be excluded.
         *
         * @agent.payloadType RemoveUndefined
         * @agent.category filtering
         * @agent.requiresAttribute true
         * @example
         * {
         *   "attribute": { "type": "SAMPLE_ATTRIBUTE", "specifier": "purity" }
         * }
         */
        removeUndefined: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").RemoveUndefined>} */
            action
        ) => {
            applyToSamples(state, (samples) =>
                filterUndefined(samples, createObjectAccessor(action))
            );
        },

        /**
         * Group samples into named groups using an explicit mapping of attribute values.
         *
         * Use this when specific attribute values should be merged into custom
         * named groups. Samples whose value is not listed in `groups` are not
         * kept in the grouped result.
         *
         * @agent.payloadType GroupCustom
         * @agent.category grouping
         * @agent.requiresAttribute true
         * @agent.attributeKinds nominal,ordinal
         * @example
         * {
         *   "attribute": { "type": "SAMPLE_ATTRIBUTE", "specifier": "diagnosis" },
         *   "groups": {
         *     "Myeloid": ["AML", "MDS"],
         *     "Lymphoid": ["ALL", "CLL"]
         *   }
         * }
         */
        groupCustomCategories: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").GroupCustom>} */
            action
        ) => {
            const accessor = makeCustomGroupAccessor(
                createObjectAccessor(action),
                action.payload.groups
            );
            applyToGroups(state, (sampleGroup) =>
                groupSamplesByAccessor(
                    sampleGroup,
                    accessor,
                    Object.keys(action.payload.groups)
                )
            );

            state.groupMetadata.push({
                attribute: action.payload.attribute,
            });
        },

        /**
         * Group samples by the distinct values of a selected categorical attribute.
         *
         * Use this to stratify the current sample collection into one group
         * per visible category. Group order follows the resolved attribute
         * domain, and categories with no samples are omitted.
         *
         * @agent.payloadType GroupByNominal
         * @agent.category grouping
         * @agent.requiresAttribute true
         * @agent.attributeKinds nominal,ordinal
         * @example
         * {
         *   "attribute": { "type": "SAMPLE_ATTRIBUTE", "specifier": "diagnosis" }
         * }
         */
        groupByNominal: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").GroupByNominal>} */
            action
        ) => {
            applyToGroups(state, (sampleGroup) =>
                groupSamplesByAccessor(
                    sampleGroup,
                    createObjectAccessor(action),
                    action.payload[AUGMENTED_KEY].domain
                )
            );
            state.groupMetadata.push({
                attribute: action.payload.attribute,
            });
        },

        /**
         * Group samples into quartile-based bins of a selected quantitative attribute.
         *
         * Use this for a quick quantitative stratification. Quartiles are
         * computed from the current samples in each group using the R-7
         * method, and tied values may collapse adjacent quartiles.
         *
         * @agent.payloadType GroupToQuartiles
         * @agent.category grouping
         * @agent.requiresAttribute true
         * @agent.attributeKinds quantitative
         * @example
         * {
         *   "attribute": { "type": "SAMPLE_ATTRIBUTE", "specifier": "purity" }
         * }
         */
        groupToQuartiles: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").GroupToQuartiles>} */
            action
        ) => {
            applyToGroups(state, (sampleGroup) =>
                groupSamplesByQuartiles(
                    sampleGroup,
                    createObjectAccessor(action)
                )
            );
            state.groupMetadata.push({
                attribute: action.payload.attribute,
            });
        },

        /**
         * Group samples into threshold-defined numeric intervals of a selected quantitative attribute.
         *
         * Use this when quantitative bins should follow explicit thresholds
         * instead of quartiles. The resulting groups are ordered from the
         * highest interval to the lowest.
         *
         * @agent.payloadType GroupByThresholds
         * @agent.category grouping
         * @agent.requiresAttribute true
         * @agent.attributeKinds quantitative
         * @example
         * {
         *   "attribute": { "type": "SAMPLE_ATTRIBUTE", "specifier": "purity" },
         *   "thresholds": [
         *     { "operator": "lte", "operand": 0.2 },
         *     { "operator": "lt", "operand": 0.8 }
         *   ]
         * }
         */
        groupByThresholds: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").GroupByThresholds>} */
            action
        ) => {
            applyToGroups(state, (sampleGroup) =>
                groupSamplesByThresholds(
                    sampleGroup,
                    createObjectAccessor(action),
                    action.payload.thresholds
                )
            );
            state.groupMetadata.push({
                attribute: action.payload.attribute,
            });
        },

        /**
         * Remove a previously created sample group by path.
         *
         * Use this to delete one visible group from the current grouping
         * hierarchy. The path is relative to the implicit root group.
         *
         * @agent.payloadType RemoveGroup
         * @agent.category grouping
         * @example
         * {
         *   "path": ["Group 1"]
         * }
         */
        removeGroup: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").RemoveGroup>} */
            action
        ) => {
            const root = state.rootGroup;
            if (isGroupGroup(root)) {
                removeGroup(root, action.payload.path);
            }
        },

        /**
         * Retain samples whose selected value appears in every current non-empty group.
         *
         * Use this for intersection-style cohort refinement after samples have
         * already been split into groups. A value is kept only if it appears
         * in every current non-empty group.
         *
         * @agent.payloadType RetainMatched
         * @agent.category grouping
         * @agent.requiresAttribute true
         * @agent.attributeKinds nominal,ordinal
         * @example
         * {
         *   "attribute": { "type": "SAMPLE_ATTRIBUTE", "specifier": "patient_id" }
         * }
         */
        retainMatched: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").RetainMatched>} */
            action
        ) => {
            const accessor = createObjectAccessor(action);
            const intersectedValues = getMatchedValues(
                getSampleGroups(state).map((group) => group.samples),
                accessor
            );

            applyToSamples(state, (samples) =>
                filterNominal(samples, accessor, "retain", intersectedValues)
            );
        },
    },
});

/**
 * Applies an operation to each group of samples.
 * @param {SampleHierarchy} sampleHierarchy
 * @param {function(string[]):string[]} operation What to do for each group.
 *      Takes an array of sample ids and returns a new filtered and/or permuted array.
 */
function applyToSamples(sampleHierarchy, operation) {
    for (const sampleGroup of getSampleGroups(sampleHierarchy)) {
        sampleGroup.samples = operation(sampleGroup.samples);
    }
}

/**
 * Applies an operation to all SampleGroups.
 * @param {SampleHierarchy} sampleHierarchy
 * @param {function(SampleGroup):void} operation What to do for each group.
 *      Operations modify the groups in place
 */
function applyToGroups(sampleHierarchy, operation) {
    for (const sampleGroup of getSampleGroups(sampleHierarchy)) {
        operation(sampleGroup);
    }
}

/**
 * @param {SampleHierarchy} [sampleHierarchy] State to use, defaults to the current state.
 *      Use for mutations!
 */
function getSampleGroups(sampleHierarchy) {
    return /** @type {SampleGroup[]} */ (
        getFlattenedGroupHierarchy(sampleHierarchy).map((path) => peek(path))
    );
}

/**
 * Returns a flattened group hierarchy. The result is an array of
 * flat hierarchies, i.e. each element is an array of groups and the
 * last group of each array is a SampleGroup which contains the samples.
 * This is the shared source of truth for group traversal in reducers.
 *
 * @param {SampleHierarchy} [sampleHierarchy] State to use, defaults to the current state.
 *      Use for mutations!
 */
export function getFlattenedGroupHierarchy(sampleHierarchy) {
    /** @type {Group[]} */
    const pathStack = [];

    /** @type {Group[][]} */
    const flattenedHierarchy = [];

    /** @param {Group} group */
    const recurse = (group) => {
        pathStack.push(group);
        if (isGroupGroup(group)) {
            for (const child of group.groups) {
                recurse(child);
            }
        } else {
            flattenedHierarchy.push([...pathStack]);
        }

        pathStack.pop();
    };

    recurse(sampleHierarchy.rootGroup);

    return flattenedHierarchy;
}

/**
 * @param {Group} group
 * @return {group is SampleGroup}
 */
export function isSampleGroup(group) {
    return "samples" in group;
}

/**
 * @param {Group} group
 * @return {group is GroupGroup}
 */
export function isGroupGroup(group) {
    return "groups" in group;
}

/**
 * Iterates the hierarchy, returning arrays that represent the path from
 * the root to the yielded node.
 *
 * @param {Group} group
 * @returns {Generator<Group[]>}
 */
export function* iterateGroupHierarchy(group) {
    yield [group];

    if (isGroupGroup(group)) {
        for (const child of group.groups) {
            for (const elem of iterateGroupHierarchy(child)) {
                yield [group, ...elem];
            }
        }
    }
}

/**
 * Returns the samples as a flat array
 */
export const sampleSelector = createSelector(
    (
        /** @type {import("./sampleState.js").SampleHierarchy} */ sampleHierarchy
    ) => sampleHierarchy.sampleData?.entities,
    (entities) => entities && Object.values(entities)
);

/**
 * Augments an attribute-related action by accessing and storing
 * the attribute values for current samples prior to dispatching the action.
 * This allows reducers to use the accessed values without needing to
 * access attribute info or accessors, which would be an impure approach.
 *
 * TODO: Make an async version for use cases when data must be fetched
 * before accessing attribute values, e.g. when using lazy loading.
 *
 * @template {PayloadWithAttribute} T
 * @param {PayloadAction<T>} action
 * @param {SampleHierarchy} sampleHierarchy
 * @param {import("../compositeAttributeInfoSource.js").AttributeInfoSource} getAttributeInfo
 */
export function augmentAttributeAction(
    action,
    sampleHierarchy,
    getAttributeInfo
) {
    if (!action.payload.attribute) {
        return action;
    }

    const attributeInfo = getAttributeInfo(action.payload.attribute);
    if (!attributeInfo) {
        throw new Error(
            `Attribute info for attribute "${action.payload.attribute}" not found`
        );
    }

    const actionType = /** @type {SampleActionType} */ (
        action.type.split("/")[1]
    );
    if (!(actionType in sampleSlice.actions)) {
        throw new Error(`Invalid action type: ${actionType}`);
    }

    if (actionType === "deriveMetadata") {
        return augmentDerivedMetadataAction(
            /** @type {PayloadAction<import("./payloadTypes.js").DeriveMetadata>} */ (
                /** @type {unknown} */ (action)
            ),
            sampleHierarchy,
            attributeInfo
        );
    }

    const accessor = attributeInfo.accessor;

    const wrappedAccessor =
        actionType == "sortBy"
            ? wrapAccessorForComparison(
                  (sampleId) => accessor(sampleId, sampleHierarchy),
                  attributeInfo
              )
            : accessor;

    /** @type {import("./payloadTypes.js").AugmentedAttribute} */
    const accessed = {
        values: getSampleGroups(sampleHierarchy).reduce((acc, group) => {
            for (const sampleId of group.samples) {
                acc[sampleId] = wrappedAccessor(sampleId, sampleHierarchy);
            }
            return acc;
        }, /** @type {Record<string, any>} */ ({})),
    };

    if (actionType == "groupByNominal") {
        accessed.domain = attributeInfo.scale?.domain();
    }

    return {
        ...action,
        payload: {
            ...action.payload,
            [AUGMENTED_KEY]: accessed,
        },
    };
}

/**
 * @param {PayloadAction<import("./payloadTypes.js").DeriveMetadata>} action
 * @param {SampleHierarchy} sampleHierarchy
 * @param {import("../types.js").AttributeInfo} attributeInfo
 */
function augmentDerivedMetadataAction(action, sampleHierarchy, attributeInfo) {
    if (!sampleHierarchy.sampleData) {
        throw new Error("Sample data has not been initialized.");
    }

    const attributeName = action.payload.name.trim();
    if (attributeName.length === 0) {
        throw new Error("Derived metadata name is missing.");
    }

    const sampleIds = sampleHierarchy.sampleData.ids;
    const values = attributeInfo.valuesProvider({
        sampleIds,
        sampleHierarchy,
    });

    if (values.length !== sampleIds.length) {
        throw new Error(
            "Derived metadata values length does not match sample ids."
        );
    }

    /** @type {import("./payloadTypes.js").ColumnarMetadata} */
    const columnarMetadata = {
        sample: sampleIds,
        [attributeName]: values,
    };

    const resolvedType = resolveDataType(attributeInfo, { strict: false });

    /** @type {Record<string, import("@genome-spy/app/spec/sampleView.js").SampleAttributeDef>} */
    const attributeDefs = {
        [attributeName]: {
            type: emptyToUndefined(resolvedType),
            scale: emptyToUndefined(action.payload.scale),
        },
    };

    const groupPath = action.payload.groupPath?.trim() ?? "";
    const payload =
        groupPath.length > 0
            ? {
                  columnarMetadata: applyGroupToColumnarMetadata(
                      columnarMetadata,
                      groupPath,
                      METADATA_PATH_SEPARATOR
                  ),
                  attributeDefs: applyGroupToAttributeDefs(
                      attributeDefs,
                      groupPath,
                      METADATA_PATH_SEPARATOR
                  ),
              }
            : { columnarMetadata, attributeDefs };

    return {
        ...action,
        payload: {
            ...action.payload,
            [AUGMENTED_KEY]: {
                metadata: payload,
            },
        },
    };
}

/**
 * @param {import("../types.js").AttributeInfo | null} attributeInfo
 * @param {{ strict?: boolean }} [options]
 * @returns {import("@genome-spy/app/spec/sampleView.js").SampleAttributeType | null}
 */
