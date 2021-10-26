import { createSlice } from "@reduxjs/toolkit";
import { peek } from "../utils/arrayUtils";
import {
    groupSamplesByAccessor,
    groupSamplesByQuartiles,
} from "./groupOperations";
import {
    filterNominal,
    filterQuantitative,
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
 */

/**
 * @template P
 * @typedef {import("@reduxjs/toolkit").PayloadAction<P>} PayloadAction
 */

/**
 * @param {string[]} [samples]
 * @returns {SampleHierarchy}
 */
function createInitialState(samples = []) {
    return {
        groups: [],
        rootGroup: {
            name: "ROOT",
            label: "Root",
            samples,
        },
    };
}

/**
 * @param {import("./attributeInfoCollection").AttributeInfoSource} getAttributeInfo
 */
export function createSampleSlice(getAttributeInfo) {
    /**
     * Returns an accessor to an abstract attribute.
     * TODO: Memoize
     * @param {import("./payloadTypes").PayloadWithAttribute} payload
     */
    const getAccessor = (payload) =>
        getAttributeInfo(payload.attribute).accessor;

    return createSlice({
        name: "samples",
        initialState: createInitialState(),
        reducers: {
            setSamples: (
                state,
                /** @type {PayloadAction<import("./payloadTypes").SetSamples>} */ action
            ) => {
                const newState = createInitialState(action.payload.samples);
                state.groups = newState.groups;
                state.rootGroup = newState.rootGroup;
            },

            sortBy: (
                state,
                /** @type {PayloadAction<import("./payloadTypes").SortBy>} */ action
            ) => {
                applyToSamples(state, (samples) =>
                    sort(
                        samples,
                        wrapAccessorForComparison(
                            getAccessor(action.payload),
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
                    retainFirstOfEach(samples, getAccessor(action.payload))
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
                        getAccessor(action.payload),
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
                        getAccessor(action.payload),
                        action.payload.action,
                        action.payload.values
                    )
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
                        getAccessor(action.payload)
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
                        getAccessor(action.payload)
                    )
                );
            },
        },
    });
}

/**
 * Applies an operation to each group of samples.
 * @param {SampleHierarchy} state
 * @param {function(string[]):string[]} operation What to do for each group.
 *      Takes an array of sample ids and returns a new filtered and/or permuted array.
 */
function applyToSamples(state, operation) {
    for (const sampleGroup of getSampleGroups(state)) {
        sampleGroup.samples = operation(sampleGroup.samples);
    }
}

/**
 * Applies an operation to all SampleGroups.
 * @param {SampleHierarchy} state
 * @param {function(SampleGroup):void} operation What to do for each group.
 *      Operations modify the groups in place
 */
function applyToGroups(state, operation) {
    for (const sampleGroup of getSampleGroups(state)) {
        operation(sampleGroup);
    }
}

/**
 * @param {SampleHierarchy} [state] State to use, defaults to the current state.
 *      Use for mutations!
 */
function getSampleGroups(state) {
    return /** @type {SampleGroup[]} */ (
        getFlattenedGroupHierarchy(state).map((path) => peek(path))
    );
}

/**
 * Returns a flattened group hierarchy. The result is an array of
 * flat hierarchies, i.e. each element is an array of groups and the
 * last group of each array is a SampleGroup which contains the samples.
 *
 * @param {SampleHierarchy} [state] State to use, defaults to the current state.
 *      Use for mutations!
 */
function getFlattenedGroupHierarchy(state) {
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
