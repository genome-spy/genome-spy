import { group, quantileSorted, range, sort as d3sort } from "d3-array";
import produce from "immer";

import * as Actions from "./sampleHandlerActions";
import { peek } from "../utils/arrayUtils";
import { isNumber } from "vega-util";
import {
    sort,
    retainFirstOfEach,
    filterQuantitative,
    filterNominal,
    filterUndefined,
    wrapAccessorForComparison
} from "./operations";

/**
 * This class handles sample sorting, filtering, grouping, etc.
 *
 * TODO: Consider employing Redux, Mobx, Trrack, ...
 *
 * @typedef {object} Sample
 * @prop {string} id
 * @prop {string} displayName
 * @prop {number} indexNumber For internal user, mainly for shaders
 * @prop {Record<string, any>} attributes Arbitrary sample specific attributes
 *
 * @typedef {import("./sampleState").State} State
 * @typedef {import("./sampleState").Group} Group
 * @typedef {import("./sampleState").SampleGroup} SampleGroup
 * @typedef {import("./sampleState").GroupGroup} GroupGroup
 *
 * @typedef {object} AttributeInfo
 * @prop {string} name
 * @prop {string} type
 * @prop {any} scale
 *
 * @typedef {(function(any):AttributeInfo)} AttributeInfoSource
 */
export default class SampleHandler {
    constructor() {
        /**
         *
         * @type {AttributeInfoSource[]} Function that
         *      returns metadata about an attribute.
         */
        this.attributeInfoSources = [];

        this.setSamples([]);
    }

    /**
     *
     * @param {AttributeInfoSource} attributeInfoSource Function that
     *      returns metadata about an attribute.
     */
    addAttributeInfoSource(attributeInfoSource) {
        this.attributeInfoSources.push(attributeInfoSource);
    }

    /**
     *
     * @param {string} attribute
     */
    getAttributeInfo(attribute) {
        for (const source of this.attributeInfoSources) {
            const info = source(attribute);
            if (info) {
                return info;
            }
        }

        throw new Error("Unknown attribute: " + JSON.stringify(attribute));
    }

    /**
     * Sets the samples that we are working with, resets the state.
     *
     * @param {Sample[]} samples
     */
    setSamples(samples) {
        /**
         * A map of sample objects for fast lookup
         */
        this.sampleMap = new Map(samples.map(sample => [sample.id, sample]));

        /**
         * The state, i.e., currently visible samples that have been sorted/filtered
         *
         * @type {State}
         */
        this.state = {
            groups: [],
            rootGroup: {
                name: "ROOT",
                samples: samples.map(sample => sample.id)
            }
        };

        /**
         * TODO: Use immer's patches:
         * https://techinscribed.com/implementing-undo-redo-functionality-in-redux-using-immer/
         *
         * @type {State[]}
         */
        this.stateHistory = [];

        /** @param {string} sampleId */
        this.sampleAccessor = sampleId => this.sampleMap.get(sampleId);
    }

    getAllSamples() {
        return [...this.sampleMap.values()];
    }

    /**
     * Returns a flattened group hierarchy. The result is an array of flat
     * flat hierarchies, i.e. each element is an array of groups and the
     * last group of each array is a SampleGroup which contains the samples.
     *
     * @param {State} [state] State to use, defaults to the current state.
     *      Use for mutations!
     */
    getFlattenedGroupHierarchy(state) {
        if (!state) {
            state = this.state;
        }

        /** @type {Group[]} */
        const pathStack = [];

        /** @type {Group[][]} */
        const flattenedHierarchy = [];

        /** @param {Group} group */
        const recurse = group => {
            pathStack.push(group);
            if (isGroupGroup(group)) {
                // WTF type guard not workin!
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
     *
     * @param {State} [state] State to use, defaults to the current state.
     *      Use for mutations!
     */
    getSampleGroups(state) {
        return /** @type {SampleGroup[]} */ (this.getFlattenedGroupHierarchy(
            state
        ).map(path => peek(path)));
    }

    /**
     *
     * @param {string} attribute
     * @returns {function(string):any}
     */
    getAttributeAccessor(attribute) {
        /** @param {Sample} sample */
        const attributeAccessor = sample => sample.attributes[attribute];

        return sampleId => attributeAccessor(this.sampleAccessor(sampleId));
    }

    /**
     *
     * @param {any} action
     */
    dispatch(action) {
        /** @type {function(string[]):string[]} What to do for each group */
        let operation;

        const accessor = this.getAttributeAccessor(action.attribute);

        switch (action.type) {
            case Actions.UNDO:
                if (this.stateHistory.length) {
                    this.state = this.stateHistory.pop();
                }
                break;
            case Actions.SORT_BY_NAME:
                operation = samples =>
                    sort(
                        samples,
                        sampleId => this.sampleAccessor(sampleId).displayName,
                        false
                    );
                break;
            case Actions.SORT_BY_ATTRIBUTE:
                operation = samples =>
                    sort(
                        samples,
                        wrapAccessorForComparison(
                            accessor,
                            this.getAttributeInfo(action.attribute)
                        ),
                        false
                    );
                break;
            case Actions.RETAIN_FIRST_OF_EACH:
                operation = samples => retainFirstOfEach(samples, accessor);
                break;
            case Actions.FILTER_BY_QUANTITATIVE_ATTRIBUTE:
                operation = samples =>
                    filterQuantitative(
                        samples,
                        accessor,
                        action.operator,
                        action.operand
                    );
                break;
            case Actions.FILTER_BY_NOMINAL_ATTRIBUTE:
                operation = samples =>
                    filterNominal(
                        samples,
                        accessor,
                        action.action,
                        action.values
                    );
                break;
            case Actions.FILTER_BY_UNDEFINED_ATTRIBUTE:
                operation = samples => filterUndefined(samples, accessor);
                break;
            case Actions.GROUP_BY_NOMINAL_ATTRIBUTE:
                this.stateHistory.push(this.state);
                this.state = produce(this.state, draftState => {
                    for (const sampleGroup of this.getSampleGroups(
                        draftState
                    )) {
                        groupSamplesByAccessor(sampleGroup, accessor);
                    }
                    draftState.groups.push({ name: action.attribute });
                });
                break;
            case Actions.GROUP_BY_QUARTILES:
                this.stateHistory.push(this.state);
                this.state = produce(this.state, draftState => {
                    for (const sampleGroup of this.getSampleGroups(
                        draftState
                    )) {
                        groupSamplesByQuartiles(sampleGroup, accessor);
                    }
                    draftState.groups.push({ name: action.attribute });
                });
                break;
            default:
                throw new Error("Unknown action: " + JSON.stringify(action));
        }

        if (operation) {
            this.stateHistory.push(this.state);
            this.state = produce(this.state, draftState => {
                for (const sampleGroup of this.getSampleGroups(draftState)) {
                    sampleGroup.samples = operation(sampleGroup.samples);
                }
            });
        }
    }
}

/**
 * @param {Group} group
 * @return {Group is SampleGroup}
 */
export function isSampleGroup(group) {
    return "samples" in group;
}

/**
 * @param {Group} group
 * @return {Group is GroupGroup}
 */
export function isGroupGroup(group) {
    return "groups" in group;
}

// ------------- TODO: own file for the following --------

/**
 *
 * @param {SampleGroup} sampleGroup
 * @param {function(any):any} accessor
 */
function groupSamplesByAccessor(sampleGroup, accessor) {
    const grouped = /** @type {Map<any, string[]>} */ (group(
        sampleGroup.samples,
        accessor
    ));

    // Transform SampleGroup into GroupGroup
    const groupGroup = /** @type {GroupGroup} */ /** @type {unknown} */ (sampleGroup);

    groupGroup.groups = [...grouped.entries()].map(([name, samples]) => ({
        name: "" + name,
        samples
    }));

    delete sampleGroup.samples;
}

/**
 *
 * @param {SampleGroup} sampleGroup
 * @param {function(any):any} accessor
 */
function groupSamplesByQuartiles(sampleGroup, accessor) {
    const quartiles = extractQuantiles(sampleGroup.samples, accessor, [
        0.25,
        0.5,
        0.75
    ]);

    groupSamplesByAccessor(
        sampleGroup,
        createQuantileAccessor(accessor, quartiles)
    );
}

/**
 * Returns an accessor that extracts a quantile-index (1-based) based
 * on the given thresholds.
 *
 * @param {function(any):any} accessor
 * @param {number[]} thresholds Must be in ascending order
 */
function createQuantileAccessor(accessor, thresholds) {
    /** @param {any} datum */
    const quantileAccessor = datum => {
        const value = accessor(datum);
        if (!isNumber(value) || isNaN(value)) {
            return undefined;
        }

        for (let i = 0; i < thresholds.length; i++) {
            // TODO: This cannot be correct...
            if (value < thresholds[i]) {
                return i;
            }
        }

        return thresholds.length;
    };

    return quantileAccessor;
}

/**
 * @param {T[]} samples
 * @param {function(T):any} accessor
 * @param {number[]} pValues
 * @returns {number[]}
 * @template T
 */
function extractQuantiles(samples, accessor, pValues) {
    const values = d3sort(
        samples.map(accessor).filter(x => isNumber(x) && !isNaN(x))
    );

    return pValues.map(p => quantileSorted(values, p));
}