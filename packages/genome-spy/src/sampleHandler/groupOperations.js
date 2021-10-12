import { group, quantileSorted, range, sort as d3sort } from "d3-array";
import { format as d3format } from "d3-format";
import { isNumber } from "vega-util";

/**
 * @typedef {import("./sampleState").Group} Group
 * @typedef {import("./sampleState").SampleGroup} SampleGroup
 * @typedef {import("./sampleState").GroupGroup} GroupGroup
 */

/**
 *
 * @param {SampleGroup} sampleGroup
 * @param {function(any):any} accessor
 * @param {any[]} [groups] Explicitly specify the groups and their order
 * @param {string[]} [labels] Custom labels for the groups
 */
export function groupSamplesByAccessor(sampleGroup, accessor, groups, labels) {
    if (labels && !groups) {
        throw new Error("Custom labels need explicit group order!");
    }

    const grouped = /** @type {Map<any, string[]>} */ (
        group(sampleGroup.samples, accessor)
    );

    const sortedEntries = groups
        ? groups
              .map(
                  (groupTerm) =>
                      /** @type {[any, string[]]} */ ([
                          groupTerm,
                          grouped.get(groupTerm),
                      ])
              )
              .filter((entry) => entry[1])
        : [...grouped];

    const tempGroup = /** @type {unknown} */ (sampleGroup);
    // Transform SampleGroup into GroupGroup
    const groupGroup = /** @type {GroupGroup} */ (tempGroup);

    groupGroup.groups = sortedEntries.map(([name, samples], i) => ({
        name: "" + name,
        label: labels ? labels[i] : name,
        samples,
    }));

    delete sampleGroup.samples;
}

/**
 *
 * @param {SampleGroup} sampleGroup
 * @param {function(any):any} accessor
 */
export function groupSamplesByQuartiles(sampleGroup, accessor) {
    const format = d3format(".3~r");

    const thresholds = uniq(
        extractQuantiles(sampleGroup.samples, accessor, [0, 0.25, 0.5, 0.75, 1])
    );

    if (thresholds.length == 1) {
        thresholds.push(thresholds[0]);
    }

    /** @param {number} i */
    const formatInterval = (i) =>
        `[${format(thresholds[i])}, ${format(thresholds[i + 1])}${
            i < thresholds.length - 2 ? ")" : "]"
        }`;

    // TODO: Group ids should indicate if multiple identical thresholds were merged
    const groupIds = range(thresholds.length - 1).reverse();

    groupSamplesByAccessor(
        sampleGroup,
        createQuantileAccessor(
            accessor,
            thresholds.slice(1, thresholds.length - 1)
        ),
        groupIds,
        groupIds.map(formatInterval)
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
    const quantileAccessor = (datum) => {
        const value = accessor(datum);
        if (!isNumber(value) || isNaN(value)) {
            return undefined;
        }

        for (let i = 0; i < thresholds.length; i++) {
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
        samples.map(accessor).filter((x) => isNumber(x) && !isNaN(x))
    );

    return pValues.map((p) => quantileSorted(values, p));
}

/**
 * Returns unique values from a sorted array.
 *
 * @param {T[]} arr
 * @returns {T[]}
 * @template T
 */
function uniq(arr) {
    const result = [arr[0]];
    for (let i = 1; i < arr.length; i++) {
        if (arr[i] != arr[i - 1]) {
            result.push(arr[i]);
        }
    }
    return result;
}
