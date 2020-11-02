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
    handleAction(action) {
        /** @type {Sample[]} */
        let newSamples;

        if (action.type == Actions.SORT_BY_ATTRIBUTE) {
            newSamples = sort(
                this.samples,
                getAttributeAccessor(action.attribute),
                false
            );
        } else if (action.type == Actions.RETAIN_FIRST_OF_EACH) {
            newSamples = retainFirstOfEach(
                this.samples,
                getAttributeAccessor(action.attribute)
            );
        } else if (action.type == Actions.FILTER_BY_QUANTITATIVE_ATTRIBUTE) {
            newSamples = filterQuantitative(
                this.samples,
                getAttributeAccessor(action.attribute),
                action.operator,
                action.operand
            );
        } else if (action.type == Actions.FILTER_BY_UNDEFINED_ATTRIBUTE) {
            newSamples = filterUndefined(
                this.samples,
                getAttributeAccessor(action.attribute)
            );
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
 * @param {Sample[]} samples
 * @param {function(any):any} accessor
 */
function retainFirstOfEach(samples, accessor) {
    const included = new Set();

    /** @param {string} key */
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
 * @param {Sample[]} samples
 * @param {function(any):any} accessor
 * @param {boolean} [descending]
 */
function sort(samples, accessor, descending = false) {
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
 * TODO: Ordinal attributes
 *
 * @param {Sample[]} samples
 * @param {function(any):any} accessor
 * @param {ComparisonOperatorType} operator The comparison operator
 * @param {any} operand
 */
function filterQuantitative(samples, accessor, operator, operand) {
    const op = COMPARISON_OPERATORS[operator];
    return samples.filter(sample => op(accessor(sample), operand));
}

/**
 * TODO: Ordinal attributes
 *
 * @param {Sample[]} samples
 * @param {function(any):any} accessor
 */
function filterUndefined(samples, accessor) {
    const isValid = x => x !== undefined && x !== null;
    return samples.filter(sample => isValid(accessor(sample)));
}
