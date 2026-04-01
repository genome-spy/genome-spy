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
         * Set the initial sample collection for this view.
         *
         * Use this when samples are first loaded or the entire collection is
         * replaced.
         *
         * @agent.payloadType SetSamples
         * @agent.category initialization
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
         * Add imported sample metadata to the current collection.
         *
         * Use this for metadata uploads or source imports that provide
         * columnar sample attributes.
         *
         * @agent.payloadType SetMetadata
         * @agent.category metadata
         */
        addMetadata: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").SetMetadata>} */ action
        ) => {
            applyMetadataPayload(state, action.payload);
        },

        /**
         * Add derived metadata computed from a view-backed attribute.
         *
         * Use this when the user wants to turn a selected field into a new
         * sample metadata column.
         *
         * @agent.payloadType DeriveMetadata
         * @agent.category metadata
         * @agent.requiresAttribute true
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
         * Add metadata imported from an external source.
         *
         * The payload is resolved by the metadata source machinery before the
         * reducer runs.
         *
         * @agent.payloadType AddMetadataFromSource
         * @agent.category metadata
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
         * Sort samples in descending order by the chosen attribute.
         *
         * Use this when the user wants to rank samples by a single attribute.
         * The attribute is typically quantitative or ordinal.
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
         * Retain the first sample of each category in the current ordering.
         *
         * Use this when the current sort order already encodes the desired
         * representative sample for each category.
         *
         * @agent.payloadType RetainFirstOfEach
         * @agent.category grouping
         * @agent.requiresAttribute true
         * @agent.attributeKinds nominal,ordinal
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
         * Retain samples from the first n categories in the current ordering.
         *
         * Use this when the user wants to keep only the leading categories
         * according to a prior sort or ranking.
         *
         * @agent.payloadType RetainFirstNCategories
         * @agent.category grouping
         * @agent.requiresAttribute true
         * @agent.attributeKinds nominal,ordinal
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
         * Retain or remove samples using a numeric comparison.
         *
         * Use this for threshold-based filtering on quantitative attributes.
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
         * Retain or remove samples by exact discrete values.
         *
         * Use this for categorical metadata and exact-match filtering.
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
         * Remove samples that are missing the chosen attribute.
         *
         * Use this to clean up incomplete metadata before applying further
         * analysis steps.
         *
         * @agent.payloadType RemoveUndefined
         * @agent.category filtering
         * @agent.requiresAttribute true
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
         * Create custom sample groups from manually chosen categories.
         *
         * Use this when the user wants to merge specific categories into named
         * groups.
         *
         * @agent.payloadType GroupCustom
         * @agent.category grouping
         * @agent.requiresAttribute true
         * @agent.attributeKinds nominal,ordinal
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
         * Group samples by the distinct values of the chosen attribute.
         *
         * Use this to stratify the sample collection into one group per
         * category.
         *
         * @agent.payloadType GroupByNominal
         * @agent.category grouping
         * @agent.requiresAttribute true
         * @agent.attributeKinds nominal,ordinal
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
         * Group samples into quartiles by the chosen quantitative attribute.
         *
         * Use this for a fast, coarse stratification into four groups.
         *
         * @agent.payloadType GroupToQuartiles
         * @agent.category grouping
         * @agent.requiresAttribute true
         * @agent.attributeKinds quantitative
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
         * Group samples by user-defined numeric thresholds.
         *
         * Use this when the desired stratification does not match quartiles or
         * a pre-existing categorical split.
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
         * Remove a nested sample group by path.
         *
         * Use this when the user wants to delete a previously created group
         * from the hierarchy.
         *
         * @agent.payloadType RemoveGroup
         * @agent.category grouping
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
         * Retain categories that are present in all current groups.
         *
         * Use this for intersection-style cohort refinement.
         *
         * @agent.payloadType RetainMatched
         * @agent.category grouping
         * @agent.requiresAttribute true
         * @agent.attributeKinds nominal,ordinal
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
