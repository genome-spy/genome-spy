import { createSelector, createSlice } from "@reduxjs/toolkit";
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
    retainFirstNCategories,
    retainFirstOfEachCategory,
    sort,
    wrapAccessorForComparison,
} from "./sampleOperations.js";
import { AUGMENTED_KEY } from "../state/provenanceReducerBuilder.js";

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

export const SET_SAMPLES = "setSamples";
export const SORT_BY = "sortBy";
export const RETAIN_FIRST_OF_EACH = "retainFirstOfEach";
export const RETAIN_FIRST_N_CATEGORIES = "retainFirstNCategories";
export const FILTER_BY_NOMINAL = "filterByNominal";
export const FILTER_BY_QUANTITATIVE = "filterByQuantitative";
export const REMOVE_UNDEFINED = "removeUndefined";
export const GROUP_CUSTOM = "groupCustomCategories";
export const GROUP_BY_NOMINAL = "groupByNominal";
export const GROUP_BY_QUARTILES = "groupToQuartiles";
export const GROUP_BY_THRESHOLDS = "groupByThresholds";
export const REMOVE_GROUP = "removeGroup";
export const RETAIN_MATCHED = "retainMatched";

export const SAMPLE_SLICE_NAME = "sampleView";

/**
 * @returns {SampleHierarchy}
 */
function createInitialState() {
    return {
        sampleData: undefined,
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
    const obj = action.payload[AUGMENTED_KEY]?.values;
    if (!obj) {
        throw new Error(
            "No accessed values provided. Did you remember to use SampleView.dispatchAttributeAction()?"
        );
    }
    return (sampleId) => obj[sampleId];
}

export const sampleSlice = createSlice({
    name: SAMPLE_SLICE_NAME,
    initialState: createInitialState(),
    reducers: {
        [SET_SAMPLES]: (
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
                    'The sample metadata contains missing sample ids or the "sample" column is missing!'
                );
            }

            if (
                new Set(samples.map((sample) => sample.id)).size !=
                samples.length
            ) {
                throw new Error(
                    "The sample metadata contains duplicate sample ids!"
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

        [SORT_BY]: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").SortBy>} */ action
        ) => {
            applyToSamples(state, (samples) =>
                sort(samples, createObjectAccessor(action), false)
            );
        },

        [RETAIN_FIRST_OF_EACH]: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").RetainFirstOfEach>} */
            action
        ) => {
            applyToSamples(state, (samples) =>
                retainFirstOfEachCategory(samples, createObjectAccessor(action))
            );
        },

        [RETAIN_FIRST_N_CATEGORIES]: (
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

        [FILTER_BY_QUANTITATIVE]: (
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

        [FILTER_BY_NOMINAL]: (
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

        [REMOVE_UNDEFINED]: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").RemoveUndefined>} */
            action
        ) => {
            applyToSamples(state, (samples) =>
                filterUndefined(samples, createObjectAccessor(action))
            );
        },

        [GROUP_CUSTOM]: (
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

        [GROUP_BY_NOMINAL]: (
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

        [GROUP_BY_QUARTILES]: (
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

        [GROUP_BY_THRESHOLDS]: (
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

        [REMOVE_GROUP]: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").RemoveGroup>} */
            action
        ) => {
            const root = state.rootGroup;
            if (isGroupGroup(root)) {
                removeGroup(root, action.payload.path);
            }
        },

        [RETAIN_MATCHED]: (
            state,
            /** @type {PayloadAction<import("./payloadTypes.js").RetainMatched>} */
            action
        ) => {
            const accessor = createObjectAccessor(action);

            /** @type {Set<any>[]} Attribute values in each group */
            const valueSets = [];

            for (const sampleGroup of getSampleGroups(state)) {
                // Skip empty groups because they always cause empty intersections
                if (sampleGroup.samples.length > 0) {
                    /** @type {Set<any>} */
                    const values = new Set();
                    for (const sample of sampleGroup.samples) {
                        values.add(accessor(sample));
                    }
                    valueSets.push(values);
                }
            }

            /** @type {any[]} Values that are present in all groups */
            const intersectedValues = [];

            for (const value of valueSets[0]) {
                let found = true;
                for (let i = 1; i < valueSets.length && found; i++) {
                    found = valueSets[i].has(value);
                }

                if (found) {
                    intersectedValues.push(value);
                }
            }

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
 * @param {import("./compositeAttributeInfoSource.js").AttributeInfoSource} getAttributeInfo
 */
export function augmentAttributeAction(
    action,
    sampleHierarchy,
    getAttributeInfo
) {
    // TODO: Type properly

    if (!action.payload.attribute) {
        return action;
    }

    const attributeInfo = getAttributeInfo(action.payload.attribute);
    if (!attributeInfo) {
        throw new Error(
            `Attribute info for attribute "${action.payload.attribute}" not found`
        );
    }

    const accessor = attributeInfo.accessor;

    const wrappedAccessor =
        action.type == SORT_BY
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

    // TODO: Is this comparison reliable?
    if (action.type == SAMPLE_SLICE_NAME + "/" + GROUP_BY_NOMINAL) {
        accessed.domain = attributeInfo.scale?.domain();
    }

    action.payload[AUGMENTED_KEY] = accessed;

    return action;
}
