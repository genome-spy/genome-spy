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

        addMetadata: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").SetMetadata>} */ action
        ) => {
            applyMetadataPayload(state, action.payload);
        },

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

        sortBy: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").SortBy>} */ action
        ) => {
            applyToSamples(state, (samples) =>
                sort(samples, createObjectAccessor(action), true)
            );
        },

        retainFirstOfEach: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").RetainFirstOfEach>} */
            action
        ) => {
            applyToSamples(state, (samples) =>
                retainFirstOfEachCategory(samples, createObjectAccessor(action))
            );
        },

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

        removeUndefined: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").RemoveUndefined>} */
            action
        ) => {
            applyToSamples(state, (samples) =>
                filterUndefined(samples, createObjectAccessor(action))
            );
        },

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
