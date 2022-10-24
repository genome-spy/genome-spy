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
 * @param {string[]} [titles] Custom titles for the groups
 */
export function groupSamplesByAccessor(sampleGroup, accessor, groups, titles) {
    if (titles && !groups) {
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
        title: titles ? titles[i] : name,
        samples,
    }));

    delete sampleGroup.samples;
}

/**
 *
 * @param {SampleGroup} sampleGroup
 * @param {function(any):any} accessor
 * @param {import("./payloadTypes").Threshold[]} thresholds
 */
function groupSamplesByRawThresholds(sampleGroup, accessor, thresholds) {
    const format = d3format(".3~r");

    /** @param {number} i */
    const formatInterval = (i) =>
        `${thresholds[i].operator == "lt" ? "[" : "("}${format(
            thresholds[i].operand
        )}, ${format(thresholds[i + 1].operand)}${
            thresholds[i + 1].operator == "lte" ? "]" : ")"
        }`;

    const groupName = (/** @type {number} */ groupIndex) =>
        `Group ${groupIndex + 1}`;

    // TODO: Group ids should indicate if multiple identical thresholds were merged
    const groupIds = range(thresholds.length - 1).reverse();

    const ta = createThresholdAccessor(
        accessor,
        thresholds.slice(1, thresholds.length - 1)
    );

    groupSamplesByAccessor(
        sampleGroup,
        (sample) => groupName(ta(sample)),
        groupIds.map(groupName),
        groupIds.map(formatInterval)
    );
}

/**
 *
 * @param {SampleGroup} sampleGroup
 * @param {function(any):any} accessor
 * @param {import("./payloadTypes").Threshold[]} thresholds
 */
export function groupSamplesByThresholds(sampleGroup, accessor, thresholds) {
    groupSamplesByRawThresholds(sampleGroup, accessor, [
        { operator: "lt", operand: -Infinity },
        ...thresholds,
        { operator: "lte", operand: Infinity },
    ]);
}

/**
 * @param {SampleGroup} sampleGroup
 * @param {function(any):any} accessor
 */
export function groupSamplesByQuartiles(sampleGroup, accessor) {
    const thresholds = uniq(
        extractQuantiles(sampleGroup.samples, accessor, [0, 0.25, 0.5, 0.75, 1])
    );

    if (thresholds.length == 1) {
        thresholds.push(thresholds[0]);
    }

    groupSamplesByRawThresholds(
        sampleGroup,
        accessor,
        thresholds.map((t, i, a) => ({
            operator: i == a.length - 1 ? "lte" : "lt",
            operand: t,
        }))
    );
}

/**
 * Returns an accessor that extracts a group index (0-based) based
 * on the given thresholds.
 *
 * @param {function(any):any} accessor
 * @param {import("./payloadTypes").Threshold[]} thresholds Must be in ascending order
 */
function createThresholdAccessor(accessor, thresholds) {
    /** @param {any} datum */
    const thresholdAccessor = (datum) => {
        const value = accessor(datum);
        if (!isNumber(value) || isNaN(value)) {
            return undefined;
        }

        for (let i = 0; i < thresholds.length; i++) {
            if (thresholds[i].operator == "lt") {
                if (value < thresholds[i].operand) {
                    return i;
                }
            } else if (value <= thresholds[i].operand) {
                return i;
            }
        }

        return thresholds.length;
    };

    return thresholdAccessor;
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
