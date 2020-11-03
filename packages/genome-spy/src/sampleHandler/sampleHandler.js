import mapSort from "mapsort";
import * as Actions from "./sampleHandlerActions";

import { peek, shallowArrayEquals } from "../utils/arrayUtils";

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
         * @type {import("./sampleState").State}
         */
        this.state = {
            groups: [],
            rootGroup: {
                name: "ROOT",
                samples: samples.map(sample => sample.id)
            }
        };

        /** @param {string} sampleId */
        this.sampleAccessor = sampleId => this.sampleMap.get(sampleId);
    }

    getAllSamples() {
        return [...this.sampleMap.values()];
    }

    /*
     * Returns the visible sample ids in a specific order
     *
    getSampleIds() {
        return this.samples;
    }
    */

    /**
     * Returns a flattened group hierarchy. The result is an array of flat
     * flat hierarchies, i.e. each element is an array of groups and the
     * last group of each array is a SampleGroup which contains the samples.
     */
    getFlattenedGroupHierarchy() {
        /** @type {Group[]} */
        const pathStack = [];

        /** @type {Group[][]} */
        const flattenedHierarchy = [];

        /** @param {Group} group */
        const recurse = group => {
            pathStack.push(group);
            if (isGroupGroup(group)) {
                recurse(group);
            } else {
                flattenedHierarchy.push([...pathStack]);
            }

            pathStack.pop();
        };

        recurse(this.state.rootGroup);

        return flattenedHierarchy;
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
        /** @type {string[]} */
        let newSamples;

        const accessor = this.getAttributeAccessor(action.attribute);
        if (action.type == Actions.SORT_BY_NAME) {
            newSamples = sort(
                this.samples,
                sampleId => this.sampleAccessor(sampleId).displayName,
                false
            );
        } else if (action.type == Actions.SORT_BY_ATTRIBUTE) {
            newSamples = sort(this.samples, accessor, false);
        } else if (action.type == Actions.RETAIN_FIRST_OF_EACH) {
            newSamples = retainFirstOfEach(this.samples, accessor);
        } else if (action.type == Actions.FILTER_BY_QUANTITATIVE_ATTRIBUTE) {
            newSamples = filterQuantitative(
                this.samples,
                accessor,
                action.operator,
                action.operand
            );
        } else if (action.type == Actions.FILTER_BY_NOMINAL_ATTRIBUTE) {
            newSamples = filterNominal(
                this.samples,
                accessor,
                action.action,
                action.values
            );
        } else if (action.type == Actions.FILTER_BY_UNDEFINED_ATTRIBUTE) {
            newSamples = filterUndefined(this.samples, accessor);
        } else {
            throw new Error("Unknown action: " + JSON.stringify(action));
        }

        if (newSamples) {
            this._updateSamples(newSamples);
        }
    }

    /*
    backtrackSamples() {
        if (this.sampleOrderHistory.length > 1) {
            this.sampleOrderHistory.pop();

            const sampleIds = this.sampleOrderHistory[
                this.sampleOrderHistory.length - 1
            ];

            const targetSampleScale = this.sampleScale.clone();
            targetSampleScale.domain(sampleIds);

            this.genomeSpy.eventEmitter.emit("samplesupdated");

            this.animateSampleTransition(
                this.sampleScale,
                targetSampleScale,
                true
            ).then(() => {
                this.sampleOrder = sampleIds;
                this.sampleScale = targetSampleScale;
                this.renderViewport();
                this.attributePanel.renderLabels();
            });
        }
    }
    */

    /**
     * Updates the visible set of samples. Animates the transition.
     *
     * @param {string[]} samples
     */
    _updateSamples(samples) {
        /*
        // Do nothing if new samples equals the old samples
        if (
            shallowArrayEquals(
                sampleIds,
                this.sampleOrderHistory[this.sampleOrderHistory.length - 1]
            )
        ) {
            return;
        }


        // If new samples appear to reverse the last action, backtrack in history
        if (
            this.sampleOrderHistory.length > 1 &&
            shallowArrayEquals(
                sampleIds,
                this.sampleOrderHistory[this.sampleOrderHistory.length - 2]
            )
        ) {
            this.sampleOrderHistory.pop();
        } else {
            this.sampleOrderHistory.push(sampleIds);
        }
        */

        //this.sampleOrder = peek(this.sampleOrderHistory);
        this.samples = samples;
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
