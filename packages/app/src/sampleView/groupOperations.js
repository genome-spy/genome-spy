import { group, quantileSorted, range, sort as d3sort } from "d3-array";
import { format as d3format } from "d3-format";
import { isNumber } from "vega-util";
import { isGroupGroup } from "./sampleSlice.js";

/**
 * @typedef {import("./sampleState.js").Group} Group
 * @typedef {import("./sampleState.js").SampleGroup} SampleGroup
 * @typedef {import("./sampleState.js").GroupGroup} GroupGroup
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
 * @param {import("./payloadTypes.js").Threshold[]} thresholds
 */
function groupSamplesByRawThresholds(sampleGroup, accessor, thresholds) {
    const groupName = (/** @type {number} */ groupIndex) =>
        `Group ${groupIndex + 1}`;

    // TODO: Group ids should indicate if multiple identical thresholds were merged
    const groupIds = range(thresholds.length - 1).reverse();

    const ta = createThresholdGroupAccessor(
        accessor,
        thresholds.slice(1, thresholds.length - 1)
    );

    groupSamplesByAccessor(
        sampleGroup,
        (sample) => groupName(ta(sample)),
        groupIds.map(groupName),
        groupIds.map((i) =>
            formatThresholdInterval(thresholds[i], thresholds[i + 1])
        )
    );
}

/**
 *
 * @param {SampleGroup} sampleGroup
 * @param {function(any):any} accessor
 * @param {import("./payloadTypes.js").Threshold[]} thresholds
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
 *
 * @param {GroupGroup} rootGroup
 * @param {string[]} path An array of group names representing the path to the group.
 *      The implicit ROOT group is excluded.
 */
export function removeGroup(rootGroup, path) {
    if (path.length == 0) {
        // Error!
        return;
    }

    const index = rootGroup.groups.findIndex((group) => group.name == path[0]);

    if (index < 0) {
        // Error!
        return;
    }

    if (path.length == 1) {
        rootGroup.groups.splice(index, 1);
    } else if (path.length > 1) {
        const child = rootGroup.groups[index];
        if (isGroupGroup(child)) {
            removeGroup(child, [...path].splice(1));
        } else {
            // Error!
        }
    }
}

/**
 * Returns an accessor that extracts a group index (0-based) based
 * on the given thresholds.
 *
 * @param {function(any):any} accessor
 * @param {import("./payloadTypes.js").Threshold[]} thresholds Must be in ascending order
 */
export function createThresholdGroupAccessor(accessor, thresholds) {
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

const thresholdFormat = d3format(".3~r");

/**
 * TODO: Move to "utils" or something
 * @param {import("./payloadTypes.js").Threshold} t1
 * @param {import("./payloadTypes.js").Threshold} t2
 */
export const formatThresholdInterval = (t1, t2) =>
    `${t1.operator == "lt" ? "[" : "("}${thresholdFormat(
        t1.operand
    )}, ${thresholdFormat(t2.operand)}${t2.operator == "lte" ? "]" : ")"}`;
