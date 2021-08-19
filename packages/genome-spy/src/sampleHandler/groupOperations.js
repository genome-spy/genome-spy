import { group, quantileSorted, sort as d3sort } from "d3-array";
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
 */
export function groupSamplesByAccessor(sampleGroup, accessor, groups) {
    const grouped = /** @type {Map<any, string[]>} */ (group(
        sampleGroup.samples,
        accessor
    ));

    const sortedEntries = groups
        ? groups
              .map(groupTerm => /** @type {[any, string[]]} */ ([
                  groupTerm,
                  grouped.get(groupTerm)
              ]))
              .filter(entry => entry[1])
        : [...grouped];

    const tempGroup = /** @type {unknown} */ (sampleGroup);
    // Transform SampleGroup into GroupGroup
    const groupGroup = /** @type {GroupGroup} */ (tempGroup);

    groupGroup.groups = sortedEntries.map(([name, samples]) => ({
        name: "" + name,
        label: name,
        samples
    }));

    delete sampleGroup.samples;
}

/**
 *
 * @param {SampleGroup} sampleGroup
 * @param {function(any):any} accessor
 */
export function groupSamplesByQuartiles(sampleGroup, accessor) {
    const quartiles = extractQuantiles(sampleGroup.samples, accessor, [
        0.25,
        0.5,
        0.75
    ]);

    groupSamplesByAccessor(
        sampleGroup,
        createQuantileAccessor(accessor, quartiles),
        [3, 2, 1, 0] // Decreasing order
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
