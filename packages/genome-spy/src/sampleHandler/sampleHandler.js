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
 */
export default class SampleHandler {
    constructor() {
        this.setSamples([]);
    }

    /**
     * Sets the samples that we are working with
     *
     * @param {Sample[]} samples
     */
    setSamples(samples) {
        this.allSamples = samples;

        /**
         * A map of sample objects for fast lookup
         */
        this.sampleMap = new Map(samples.map(sample => [sample.id, sample]));

        /**
         * The state, i.e., currently visible samples that have been sorted/filtered
         */
        this.samples = [...this.allSamples];

        /**
         * Keep track of sample set mutations.
         */
        this.sampleOrderHistory = [this.samples];
    }

    /**
     * Returns the visible sample ids in a specific order
     */
    getSampleIds() {
        return this.samples.map(sample => sample.id);
    }

    /**
     *
     * @param {any} action
     */
    dispatch(action) {
        /** @type {Sample[]} */
        let newSamples;

        const accessor = getAttributeAccessor(action.attribute);
        if (action.type == Actions.SORT_BY_NAME) {
            newSamples = sort(
                this.samples,
                sample => sample.displayName,
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
     * @param {Sample[]} samples
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
 *
 * @param {string} attributeName
 */
function getAttributeAccessor(attributeName) {
    /** @param {Sample} sample */
    const accessor = sample => sample.attributes[attributeName];

    return accessor;
}

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
