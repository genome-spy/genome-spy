import { createSlice } from "@reduxjs/toolkit";
import { peek } from "@genome-spy/core/utils/arrayUtils";
import {
    groupSamplesByAccessor,
    groupSamplesByQuartiles,
    groupSamplesByThresholds,
} from "./groupOperations";
import {
    filterNominal,
    filterQuantitative,
    filterUndefined,
    retainFirstNCategories,
    retainFirstOfEachCategory,
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
const SORT_BY = "sortBy";
const RETAIN_FIRST_OF_EACH = "retainFirstOfEach";
const RETAIN_FIRST_N_CATEGORIES = "retainFirstNCategories";
const FILTER_BY_NOMINAL = "filterByNominal";
const FILTER_BY_QUANTITATIVE = "filterByQuantitative";
const REMOVE_UNDEFINED = "removeUndefined";
const GROUP_BY_NOMINAL = "groupByNominal";
const GROUP_BY_QUARTILES = "groupToQuartiles";
const GROUP_BY_THRESHOLDS = "groupByThresholds";
const RETAIN_MATCHED = "retainMatched";

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
        name: SAMPLE_SLICE_NAME,
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

            [RETAIN_FIRST_OF_EACH]: (
                state,
                /** @type {PayloadAction<import("./payloadTypes").RetainFirstOfEach>} */
                action
            ) => {
                applyToSamples(state, (samples) =>
                    retainFirstOfEachCategory(
                        samples,
                        getAccessor(action.payload, state)
                    )
                );
            },

            [RETAIN_FIRST_N_CATEGORIES]: (
                state,
                /** @type {PayloadAction<import("./payloadTypes").RetainFirstNCategories>} */
                action
            ) => {
                applyToSamples(state, (samples) =>
                    retainFirstNCategories(
                        samples,
                        getAccessor(action.payload, state),
                        action.payload.n
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
                        action.payload.remove ? "remove" : "retain",
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
                const domain = getAttributeInfo(
                    action.payload.attribute
                ).scale?.domain();

                applyToGroups(state, (sampleGroup) =>
                    groupSamplesByAccessor(
                        sampleGroup,
                        getAccessor(action.payload, state),
                        domain
                    )
                );
                state.groupMetadata.push({
                    attribute: action.payload.attribute,
                });
            },

            [GROUP_BY_QUARTILES]: (
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

            [GROUP_BY_THRESHOLDS]: (
                state,
                /** @type {PayloadAction<import("./payloadTypes").GroupByThresholds>} */
                action
            ) => {
                applyToGroups(state, (sampleGroup) =>
                    groupSamplesByThresholds(
                        sampleGroup,
                        getAccessor(action.payload, state),
                        action.payload.thresholds
                    )
                );
                state.groupMetadata.push({
                    attribute: action.payload.attribute,
                });
            },

            [RETAIN_MATCHED]: (
                state,
                /** @type {PayloadAction<import("./payloadTypes").RetainMatched>} */
                action
            ) => {
                const accessor = getAccessor(action.payload, state);

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
                    filterNominal(
                        samples,
                        accessor,
                        "retain",
                        intersectedValues
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
    return state.provenance.present[SAMPLE_SLICE_NAME];
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

const attributeNumberFormat = d3format(".4");

/** @type {Record<import("./sampleOperations").ComparisonOperatorType, string>} */
const verboseOps = {
    lt: "<",
    lte: "\u2264",
    eq: "=",
    gte: "\u2265",
    gt: ">",
};

/**
 * @param {any[]} values
 * @returns
 */
function formatSet(values) {
    return html`{${values.map(
        (value, i) => html`${i > 0 ? ", " : ""}<strong>${value}</strong>`
    )}}`;
}
/**
 * Describes an action for displaying it in menus or provenance tracking.
 *
 * @param {import("@reduxjs/toolkit").PayloadAction<any>} action
 * @param {import("./compositeAttributeInfoSource").AttributeInfoSource} getAttributeInfo
 * @returns {import("../state/provenance").ActionInfo}
 */
export function getActionInfo(action, getAttributeInfo) {
    if (!action.type.startsWith(SAMPLE_SLICE_NAME)) {
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

    const actionType = action.type.substring(SAMPLE_SLICE_NAME.length + 1);

    switch (actionType) {
        case SET_SAMPLES:
            return {
                ...template,
                title: "The initial state",
                icon: faCheck,
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
                    Retain the first sample of each
                    <em>${attributeName}</em>
                `,
                provenanceTitle: html`
                    Retain the first sample of each ${attributeTitle}
                `,

                icon: faMedal,
            };
        case RETAIN_FIRST_N_CATEGORIES:
            return {
                ...template,
                title: html`
                    Retain first <strong>n</strong> categories of
                    <em>${attributeName}</em>...
                `,
                provenanceTitle: html`
                    Retain first <strong>${payload.n}</strong> categories of
                    ${attributeTitle}
                `,

                icon: faMedal,
            };
        case FILTER_BY_NOMINAL: {
            const values =
                /** @type {import("@genome-spy/core/spec/channel").Scalar[]} */ (
                    payload.values
                );

            /** @param {string | import("lit").TemplateResult} attr */
            const makeTitle = (attr) => html`
                ${payload.remove ? "Remove" : "Retain"} samples having
                ${values[0] === undefined || values[0] === null
                    ? html` undefined ${attr} `
                    : html`${attr}
                      ${values.length > 1
                          ? html`in ${formatSet(values)}`
                          : html`<span class="operator">=</span>
                                <strong>${values[0]}</strong>`} `}
            `;

            return {
                ...template,
                title: makeTitle(html` <em>${attributeName}</em> `),
                provenanceTitle: makeTitle(attributeTitle),
                icon: payload.remove ? faTrashAlt : faFilter,
            };
        }
        case FILTER_BY_QUANTITATIVE: {
            /** @param {string | import("lit").TemplateResult} attr */
            const makeTitle = (attr) => html`
                Retain samples having ${attr}
                <span class="operator"
                    >${verboseOps[
                        /** @type {import("./payloadTypes").FilterByQuantitative} */ (
                            payload
                        ).operator
                    ]}</span
                >
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
                icon: faTrashAlt,
            };
        case GROUP_BY_NOMINAL:
            return {
                ...template,
                title: "Group by",
                provenanceTitle: html` Group by ${attributeTitle} `,
                icon: faObjectGroup,
            };
        case GROUP_BY_QUARTILES:
            return {
                ...template,
                title: "Group by quartiles",
                provenanceTitle: html`
                    Group by quartiles on ${attributeTitle}
                `,
                icon: faObjectGroup,
            };
        case GROUP_BY_THRESHOLDS:
            return {
                ...template,
                title: "Group by thresholds",
                provenanceTitle: html`
                    Group by thresholds
                    ${formatSet(
                        /** @type {import("./payloadTypes").GroupByThresholds} */ (
                            payload
                        ).thresholds.map(
                            (t) => `${verboseOps[t.operator]} ${t.operand}`
                        )
                    )}
                    on ${attributeTitle}
                `,
                icon: faObjectGroup,
            };
        case RETAIN_MATCHED:
            return {
                ...template,
                title: html`
                    Retain group-wise matched samples using
                    <em>${attributeName}</em>
                `,
                provenanceTitle: html`
                    Retain group-wise matched samples using ${attributeTitle}
                `,

                icon: faFilter,
            };
        default:
            return {
                ...template,
                title: JSON.stringify(action),
                icon: faCircle,
            };
    }
}
