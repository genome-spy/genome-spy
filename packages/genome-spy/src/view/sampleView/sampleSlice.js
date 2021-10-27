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

import { format as d3format } from "d3-format";
import { html } from "lit";
import {
    faSortAmountDown,
    faFilter,
    faMedal,
    faObjectGroup,
    faCircle,
    faTrashAlt,
    faCheck,
} from "@fortawesome/free-solid-svg-icons";

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

const SET_SAMPLES = "setSamples";
const SORT_BY_NAME = "sortByName";
const SORT_BY = "sortBy";
const RETAIN_FIRST_OF_EACH = "retainFirstOfEach";
const FILTER_BY_NOMINAL = "filterByNominal";
const FILTER_BY_QUANTITATIVE = "filterByQuantitative";
const REMOVE_UNDEFINED = "removeUndefined";
//const REMOVE_BY_ID = "removeById";
const GROUP_BY_NOMINAL = "groupByNominal";
const GROUP_TO_QUARTILES = "groupToQuartiles";

const SLICE_NAME = "sampleView";

/**
 * @returns {SampleHierarchy}
 */
function createInitialState() {
    return {
        sampleData: undefined,
        groupMetadata: [],
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
        name: SLICE_NAME,
        initialState: createInitialState(),
        reducers: {
            [SET_SAMPLES]: (
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

            [SORT_BY]: (
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

            [SORT_BY_NAME]: (state) => {
                alert("TODO");
            },

            [RETAIN_FIRST_OF_EACH]: (
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

            [FILTER_BY_QUANTITATIVE]: (
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

            [FILTER_BY_NOMINAL]: (
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

            [REMOVE_UNDEFINED]: (
                state,
                /** @type {PayloadAction<import("./payloadTypes").RemoveUndefined>} */
                action
            ) => {
                applyToSamples(state, (samples) =>
                    filterUndefined(samples, getAccessor(action.payload, state))
                );
            },

            [GROUP_BY_NOMINAL]: (
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
                state.groupMetadata.push({
                    attribute: action.payload.attribute,
                });
            },

            [GROUP_TO_QUARTILES]: (
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
                state.groupMetadata.push({
                    attribute: action.payload.attribute,
                });
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
    return state.present[SLICE_NAME];
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

const attributeNumberFormat = d3format(".4");

/** @type {Record<string, string>} */
const verboseOps = {
    lt: "less than",
    lte: "less than or equal to",
    eq: "equal to",
    gte: "greater than or equal to",
    gt: "greater than",
};

/**
 * Describes an action for displaying it in menus or provenance tracking.
 *
 * @param {import("@reduxjs/toolkit").PayloadAction<any>} action
 * @param {import("./compositeAttributeInfoSource").AttributeInfoSource} getAttributeInfo
 * @returns {import("../../app/provenance").ActionInfo}
 */
export function getActionInfo(action, getAttributeInfo) {
    if (!action.type.startsWith(SLICE_NAME)) {
        return;
    }

    // It would be great to have working payload typings here
    const payload = action.payload;

    const attributeInfo =
        payload.attribute && getAttributeInfo(payload.attribute);
    const attributeName = attributeInfo?.name;
    const attributeTitle =
        attributeInfo?.title || html` <em>${attributeName}</em> `;

    const template = {
        attributeName, // TODO: This may actually be unnecessary
    };

    const actionType = action.type.substring(SLICE_NAME.length + 1);

    switch (actionType) {
        case SET_SAMPLES:
            return {
                ...template,
                title: "The initial state",
                icon: faCheck,
            };
        case SORT_BY_NAME:
            return {
                ...template,
                title: "Sort by sample name",
                icon: faSortAmountDown,
            };
        case SORT_BY:
            return {
                ...template,
                title: "Sort by",
                provenanceTitle: html` Sort by ${attributeTitle} `,
                icon: faSortAmountDown,
            };
        case RETAIN_FIRST_OF_EACH:
            return {
                ...template,
                title: html`
                    Retain first sample of each unique
                    <em>${attributeName}</em>
                `,
                provenanceTitle: html`
                    Retain first sample of each unique ${attributeTitle}
                `,

                icon: faMedal,
            };
        case FILTER_BY_NOMINAL: {
            /** @param {string | import("lit").TemplateResult} attr */
            const makeTitle = (attr) => html`
                ${payload.action == "remove" ? "Remove" : "Retain"} samples
                having
                ${payload.values[0] === undefined || payload.values[0] === null
                    ? html` undefined ${attr} `
                    : html`
                          ${attr} =
                          <strong>${payload.values[0]}</strong>
                      `}
            `;

            return {
                ...template,
                title: makeTitle(html` <em>${attributeName}</em> `),
                provenanceTitle: makeTitle(attributeTitle),
                icon: payload.action == "remove" ? faTrashAlt : faFilter,
            };
        }
        case FILTER_BY_QUANTITATIVE: {
            /** @param {string | import("lit").TemplateResult} attr */
            const makeTitle = (attr) => html`
                Retain samples having ${attr} ${verboseOps[payload.operator]}
                <strong>${attributeNumberFormat(payload.operand)}</strong>
            `;

            return {
                ...template,
                title: makeTitle(html` <em>${attributeName}</em> `),
                provenanceTitle: makeTitle(attributeTitle),
                icon: faFilter,
            };
        }
        case REMOVE_UNDEFINED:
            return {
                ...template,
                title: "Remove samples having missing attribute",
                provenanceTitle: html`
                    Remove samples having missing ${attributeTitle}
                `,
                icon: faFilter,
            };
        case GROUP_BY_NOMINAL:
            return {
                ...template,
                title: "Group by",
                provenanceTitle: html` Group by ${attributeTitle} `,
                icon: faObjectGroup,
            };
        case GROUP_TO_QUARTILES:
            return {
                ...template,
                title: "Group to quartiles",
                provenanceTitle: html`
                    Group to quartiles by ${attributeTitle}
                `,
                icon: faObjectGroup,
            };
        default:
            return {
                ...template,
                title: JSON.stringify(action),
                icon: faCircle,
            };
    }
}
