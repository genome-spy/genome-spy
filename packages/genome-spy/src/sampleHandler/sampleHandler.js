import mapSort from "mapsort";
import { group, quantileSorted } from "d3-array";
import produce from "immer";
import { quantiles } from "d3-array";

import * as Actions from "./sampleHandlerActions";
import { peek } from "../utils/arrayUtils";
import { isNumber } from "vega-util";

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
 * @typedef {"lt" | "lte" | "eq" | "gte" | "gt"} ComparisonOperatorType
 *
 * @typedef {import("./sampleState").State} State
 * @typedef {import("./sampleState").Group} Group
 * @typedef {import("./sampleState").SampleGroup} SampleGroup
 * @typedef {import("./sampleState").GroupGroup} GroupGroup
 */
export default class SampleHandler {
    constructor() {
        this.setSamples([]);
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
     * @param {string} attributeName
     * @returns {function(string):any}
     */
    getAttributeAccessor(attributeName) {
        /** @param {Sample} sample */
        const attributeAccessor = sample => sample.attributes[attributeName];

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
                operation = samples => sort(samples, accessor, false);
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
    const values = samples.map(accessor).filter(x => isNumber(x) && !isNaN(x));
    values.sort();

    return pValues.map(p => quantileSorted(values, p));
}

// ------------- TODO: own file for the following --------

/**
 *
 * @param {T[]} samples
 * @param {function(T):any} accessor
 * @returns {T[]}
 * @template T
 */
function retainFirstOfEach(samples, accessor) {
    const included = new Set();

    /** @param {any} key */
    const checkAndAdd = key => {
        const has = included.has(key);
        included.add(key);
        return has;
    };

    return samples.filter(sample => !checkAndAdd(accessor(sample)));
}

/**
 * TODO: Ordinal attributes
 *
 * @param {T[]} samples
 * @param {function(T):any} accessor
 * @param {boolean} [descending]
 * @returns {T[]}
 * @template T
 */
function sort(samples, accessor, descending = false) {
    /** @type {function(any):any} */
    const replaceNaN = x =>
        typeof x == "number" && isNaN(x) ? -Infinity : x === null ? "" : x;

    return mapSort(
        samples,
        sample => replaceNaN(accessor(sample)),
        (av, bv) => {
            if (descending) {
                [av, bv] = [bv, av];
            }

            if (av < bv) {
                return -1;
            } else if (av > bv) {
                return 1;
            } else {
                return 0;
            }
        }
    );
}

/** @type {Record<ComparisonOperatorType, function(any, any):boolean>} */
const COMPARISON_OPERATORS = {
    lt: (a, b) => a < b,
    lte: (a, b) => a <= b,
    eq: (a, b) => a == b,
    gte: (a, b) => a >= b,
    gt: (a, b) => a > b
};

/**
 * @param {T[]} samples
 * @param {function(T):any} accessor
 * @param {ComparisonOperatorType} operator The comparison operator
 * @param {any} operand
 * @returns {T[]}
 * @template T
 */
function filterQuantitative(samples, accessor, operator, operand) {
    const op = COMPARISON_OPERATORS[operator];
    return samples.filter(sample => op(accessor(sample), operand));
}

/**
 * @param {T[]} samples
 * @param {function(T):any} accessor
 * @param {"retain" | "remove"} action
 * @param {any[]} values
 * @returns {T[]}
 * @template T
 */
function filterNominal(samples, accessor, action, values) {
    const valueSet = new Set(values);

    /** @type {function(any):boolean} */
    const predicate = x => valueSet.has(x);

    /** @type {function(boolean):boolean} */
    const maybeNegatedPredicate =
        action == "remove" ? x => !predicate(x) : predicate;

    return samples.filter(sample => maybeNegatedPredicate(accessor(sample)));
}

/**
 * @param {T[]} samples
 * @param {function(T):any} accessor
 * @returns {T[]}
 * @template T
 */
function filterUndefined(samples, accessor) {
    /** @type {function(any):boolean} */
    const isValid = x => x !== undefined && x !== null;
    return samples.filter(sample => isValid(accessor(sample)));
}
