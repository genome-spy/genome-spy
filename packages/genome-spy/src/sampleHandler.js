// TODO: Find a proper place

import { peek, shallowArrayEquals } from "./utils/arrayUtils";

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
        this.sampleData = samples;

        /**
         * A map of sample objects
         *
         * @type {Map<string, Sample>}
         */
        this.samples = new Map(samples.map(sample => [sample.id, sample]));

        /**
         * A mapping that specifies the order of the samples.
         *
         * @type {string[]}
         */
        this.sampleOrder = samples.map(s => s.id);

        /**
         * Keep track of sample set mutations.
         *
         * @type {string[][]}
         */
        this.sampleOrderHistory = [[...this.sampleOrder]];
    }

    /**
     *
     * @param {any} action
     */
    handleAction(action) {
        if (action.type == SORT_BY_ATTRIBUTE) {
            this._sortSamples(
                /** @param {Sample} sample */ sample =>
                    sample.attributes[/** @type {string} */ (action.attribute)]
            );
        } else {
            throw new Error("Unknown action: " + JSON.stringify(action));
        }
    }

    /**
     *
     * @param {function(Sample):any} attributeAccessor
     */
    _sortSamples(attributeAccessor) {
        let sortedSampleIds = this._getSamplesSortedByAttribute(
            attributeAccessor,
            false
        );

        /*
        if (shallowArrayEquals(sortedSampleIds, this.sampleOrder)) {
            sortedSampleIds = this._getSamplesSortedByAttribute(
                attributeAccessor,
                true
            );
        }
        */

        this._updateSamples(sortedSampleIds);
    }

    /**
     *
     * @param {function} attributeAccessor
     * @param {boolean} [descending]
     * @returns {string[]} ids of sorted samples
     */
    _getSamplesSortedByAttribute(attributeAccessor, descending = false) {
        const replaceNaN = x =>
            typeof x == "number" && isNaN(x) ? -Infinity : x === null ? "" : x;

        // TODO: Use MapSort
        return [...this.sampleOrder].sort((a, b) => {
            let av = replaceNaN(attributeAccessor(this.samples.get(a)));
            let bv = replaceNaN(attributeAccessor(this.samples.get(b)));

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
        });
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
     * @param {string[]} sampleIds
     */
    _updateSamples(sampleIds) {
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

        this.sampleOrder = peek(this.sampleOrderHistory);

        /*
        this.genomeSpy.eventEmitter.emit("samplesupdated");

        const targetSampleScale = this.sampleScale.clone();
        targetSampleScale.domain(sampleIds);

        this.animateSampleTransition(this.sampleScale, targetSampleScale).then(
            () => {
                this.sampleOrder = sampleIds;
                this.sampleScale = targetSampleScale;
                this.renderViewport();
                this.attributePanel.renderLabels();
            }
        );
        */
    }
}

// -------- action stuff --------

// Redux-style actions
const SORT_BY_NAME = "";
const SORT_BY_ATTRIBUTE = "SORT_BY_ATTRIBUTE";
const SORT_BY_LOCUS = "SORT_BY_LOCUS";
const RETAIN_FIRST_OF_EACH = "RETAIN_FIRST_OF_EACH";
const FILTER_BY_NOMINAL_ATTRIBUTE = "REMOVE_BY_NOMINAL_ATTRIBUTE";
const FILTER_BY_QUANTITATIVE_ATTRIBUTE = "REMOVE_BY_QUANTITATIVE_ATTRIBUTE";
const FILTER_BY_LOCUS = "REMOVE_BY_LOCUS";
const REMOVE_SAMPLE = "REMOVE_SAMPLE";
const REMOVE_UNDEFINED_ATTRIBUTE = "REMOVE_UNDEFINED_ATTRIBUTE";

export function sortByName() {
    return { type: SORT_BY_NAME };
}

/**
 * @param {string} attribute
 */
export function sortByAttribute(attribute) {
    return { type: SORT_BY_ATTRIBUTE, attribute };
}

/**
 * @param {string} attribute
 */
export function retainFirstOfEach(attribute) {
    return { type: RETAIN_FIRST_OF_EACH, attribute };
}

/**
 *
 * @param {string} attribute
 * @param {"lt" | "lte" | "eq" | "gte" | "gt"} operator The comparison operator
 * @param {number} operand
 */
export function filterByQuantitativeAttribute(attribute, operator, operand) {
    return {
        type: FILTER_BY_QUANTITATIVE_ATTRIBUTE,
        attribute,
        operator,
        operand
    };
}

/**
 * @param {string} attribute
 * @param {"retain" | "remove"} action
 * @param {any[]} values
 */
export function filterByNominalAttribute(attribute, action, values) {
    return {
        type: FILTER_BY_NOMINAL_ATTRIBUTE,
        attribute,
        action,
        values
    };
}
