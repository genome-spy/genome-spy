import { createSlice } from "@reduxjs/toolkit";
import { peek } from "../../utils/arrayUtils";
import {
    groupSamplesByAccessor,
    groupSamplesByQuartiles,
} from "./groupOperations";
import {
    filterNominal,
    filterQuantitative,
    filterUndefined,
    retainFirstOfEach,
    sort,
    wrapAccessorForComparison,
} from "./sampleOperations";

/**
 * @typedef {import("./sampleState").SampleHierarchy} SampleHierarchy
 * @typedef {import("./sampleState").Group} Group
 * @typedef {import("./sampleState").SampleGroup} SampleGroup
 * @typedef {import("./sampleState").GroupGroup} GroupGroup
 *
 * @typedef {import("./payloadTypes").PayloadWithAttribute} PayloadWithAttribute
 */

/**
 * @template P
 * @typedef {import("@reduxjs/toolkit").PayloadAction<P>} PayloadAction
 */

/**
 * @returns {SampleHierarchy}
 */
function createInitialState() {
    return {
        sampleData: undefined,
        groups: [],
        rootGroup: {
            name: "ROOT",
            label: "Root",
            samples: [],
        },
    };
}

/**
 * @param {import("./compositeAttributeInfoSource").AttributeInfoSource} getAttributeInfo
 */
export function createSampleSlice(getAttributeInfo) {
    /**
     * Returns an accessor to an abstract attribute.
     * TODO: Memoize
     * @param {PayloadWithAttribute} payload
     * @param {SampleHierarchy} sampleHierarchy
     */
    const getAccessor = (payload, sampleHierarchy) => {
        const a = getAttributeInfo(payload.attribute).accessor;
        return (/** @type {string} */ attribute) =>
            a(attribute, sampleHierarchy);
    };

    return createSlice({
        name: "sampleView",
        initialState: createInitialState(),
        reducers: {
            setSamples: (
                state,
                /** @type {PayloadAction<import("./payloadTypes").SetSamples>} */ action
            ) => {
                const samples = action.payload.samples;

                if (state.sampleData) {
                    throw new Error("Samples have already been set!");
                }

                if (
                    samples.some(
                        (sample) =>
                            sample.id === undefined || sample.id === null
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
                    label: "Root",
                    samples: state.sampleData.ids,
                };
            },

            sortBy: (
                state,
                /** @type {PayloadAction<import("./payloadTypes").SortBy>} */ action
            ) => {
                applyToSamples(state, (samples) =>
                    sort(
                        samples,
                        wrapAccessorForComparison(
                            getAccessor(action.payload, state),
                            getAttributeInfo(action.payload.attribute)
                        ),
                        false
                    )
                );
            },

            sortByName: (state) => {
                // TODO
            },

            retainFirstOfEach: (
                state,
                /** @type {PayloadAction<import("./payloadTypes").SortBy>} */
                action
            ) => {
                applyToSamples(state, (samples) =>
                    retainFirstOfEach(
                        samples,
                        getAccessor(action.payload, state)
                    )
                );
            },

            filterByQuantitative: (
                state,
                /** @type {PayloadAction<import("./payloadTypes").FilterByQuantitative>} */
                action
            ) => {
                applyToSamples(state, (samples) =>
                    filterQuantitative(
                        samples,
                        getAccessor(action.payload, state),
                        action.payload.operator,
                        action.payload.operand
                    )
                );
            },

            filterByNominal: (
                state,
                /** @type {PayloadAction<import("./payloadTypes").FilterByNominal>} */
                action
            ) => {
                applyToSamples(state, (samples) =>
                    filterNominal(
                        samples,
                        getAccessor(action.payload, state),
                        action.payload.action,
                        action.payload.values
                    )
                );
            },

            removeUndefined: (
                state,
                /** @type {PayloadAction<import("./payloadTypes").RemoveUndefined>} */
                action
            ) => {
                applyToSamples(state, (samples) =>
                    filterUndefined(samples, getAccessor(action.payload, state))
                );
            },

            groupByNominal: (
                state,
                /** @type {PayloadAction<import("./payloadTypes").GroupByNominal>} */
                action
            ) => {
                applyToGroups(state, (sampleGroup) =>
                    groupSamplesByAccessor(
                        sampleGroup,
                        getAccessor(action.payload, state)
                    )
                );
            },

            groupToQuartiles: (
                state,
                /** @type {PayloadAction<import("./payloadTypes").GroupToQuartiles>} */
                action
            ) => {
                applyToGroups(state, (sampleGroup) =>
                    groupSamplesByQuartiles(
                        sampleGroup,
                        getAccessor(action.payload, state)
                    )
                );
            },
        },
    });
}

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
 * @param {any} state
 * @returns {SampleHierarchy}
 */
export function sampleHierarchySelector(state) {
    return state.sampleView;
}

/**
 * Returns a flattened group hierarchy. The result is an array of
 * flat hierarchies, i.e. each element is an array of groups and the
 * last group of each array is a SampleGroup which contains the samples.
 *
 * @param {SampleHierarchy} [state] State to use, defaults to the current state.
 *      Use for mutations!
 */
export function getFlattenedGroupHierarchy(state) {
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

    recurse(state.rootGroup);

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
export function* iterateGroupHierarcy(group) {
    yield [group];

    if (isGroupGroup(group)) {
        for (const child of group.groups) {
            for (const elem of iterateGroupHierarcy(child)) {
                yield [group, ...elem];
            }
        }
    }
}
