import { group, quantileSorted, range, sort as d3sort } from "d3-array";
import { format as d3format } from "d3-format";
import { isNumber } from "vega-util";
import { isGroupGroup } from "./sampleSlice.js";
import { createComparisonPredicate } from "../../utils/predicates/comparison.js";

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
 * @param {string[]} [generatedTitles] Original generated titles for the groups
 */
export function groupSamplesByAccessor(
    sampleGroup,
    accessor,
    groups,
    titles,
    generatedTitles
) {
    if (titles && !groups) {
        throw new Error("Custom labels need explicit group order!");
    }

    const grouped = /** @type {Map<any, string[]>} */ (
        group(sampleGroup.samples, accessor)
    );

    /** @type {{ name: any, title: string | undefined, generatedTitle: string | undefined, samples: string[] | undefined }[]} */
    const sortedEntries = groups
        ? groups
              .map((groupTerm, i) => ({
                  name: groupTerm,
                  title: titles ? titles[i] : undefined,
                  generatedTitle: generatedTitles
                      ? generatedTitles[i]
                      : undefined,
                  samples: grouped.get(groupTerm),
              }))
              .filter((entry) => entry.samples)
        : [...grouped].map(([name, samples]) => ({
              name,
              title: /** @type {string | undefined} */ (undefined),
              generatedTitle: /** @type {string | undefined} */ (undefined),
              samples,
          }));

    const tempGroup = /** @type {unknown} */ (sampleGroup);
    // Transform SampleGroup into GroupGroup
    const groupGroup = /** @type {GroupGroup} */ (tempGroup);

    groupGroup.groups = sortedEntries.map((entry) => ({
        name: "" + entry.name,
        title: entry.title ?? entry.name,
        ...(entry.generatedTitle
            ? { generatedTitle: entry.generatedTitle }
            : {}),
        samples: /** @type {string[]} */ (entry.samples),
    }));

    delete sampleGroup.samples;
}

/**
 * @param {string[] | undefined} groupTitles
 * @param {number} expectedCount
 * @returns {string[] | undefined}
 */
function normalizeThresholdGroupTitles(groupTitles, expectedCount) {
    if (!groupTitles) {
        return undefined;
    }

    if (groupTitles.length !== expectedCount) {
        throw new Error(
            `Expected ${expectedCount} threshold group titles, got ${groupTitles.length}.`
        );
    }

    const titles = groupTitles.map((title) => title.trim());
    const seen = new Set();
    for (const title of titles) {
        if (!title) {
            throw new Error("Threshold group titles must be non-empty.");
        }
        if (seen.has(title)) {
            throw new Error(`Duplicate threshold group title: "${title}".`);
        }
        seen.add(title);
    }

    return titles;
}

/**
 *
 * @param {SampleGroup} sampleGroup
 * @param {function(any):any} accessor
 * @param {import("./payloadTypes.js").Threshold[]} thresholds
 * @param {string[]} [groupTitles]
 */
function groupSamplesByRawThresholds(
    sampleGroup,
    accessor,
    thresholds,
    groupTitles
) {
    const groupName = (/** @type {number} */ groupIndex) =>
        `Group ${groupIndex + 1}`;

    // TODO: Group ids should indicate if multiple identical thresholds were merged
    // Groups are ordered from highest to lowest to keep the largest values first.
    const groupIds = range(thresholds.length - 1).reverse();
    const intervalTitles = range(thresholds.length - 1).map((i) =>
        formatThresholdInterval(thresholds[i], thresholds[i + 1])
    );
    const titles = normalizeThresholdGroupTitles(
        groupTitles,
        intervalTitles.length
    );

    const ta = createThresholdGroupAccessor(
        accessor,
        thresholds.slice(1, thresholds.length - 1)
    );

    groupSamplesByAccessor(
        sampleGroup,
        (sample) => groupName(ta(sample)),
        groupIds.map(groupName),
        groupIds.map((i) => titles?.[i] ?? intervalTitles[i]),
        groupIds.map((i) => intervalTitles[i])
    );
}

/**
 *
 * @param {SampleGroup} sampleGroup
 * @param {function(any):any} accessor
 * @param {import("./payloadTypes.js").Threshold[]} thresholds
 * @param {string[]} [groupTitles]
 */
export function groupSamplesByThresholds(
    sampleGroup,
    accessor,
    thresholds,
    groupTitles
) {
    groupSamplesByRawThresholds(
        sampleGroup,
        accessor,
        [
            { operator: "lt", operand: -Infinity },
            ...thresholds,
            { operator: "lte", operand: Infinity },
        ],
        groupTitles
    );
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
        throw new Error("Cannot remove the root sample group.");
    }

    const index = rootGroup.groups.findIndex((group) => group.name == path[0]);

    if (index < 0) {
        throw new Error("Sample group path not found: " + path.join(" / "));
    }

    if (path.length == 1) {
        rootGroup.groups.splice(index, 1);
    } else if (path.length > 1) {
        const child = rootGroup.groups[index];
        if (isGroupGroup(child)) {
            removeGroup(child, path.slice(1));
        } else {
            throw new Error(
                "Sample group path does not refer to a nested group: " +
                    path.join(" / ")
            );
        }
    }
}

/**
 * Retains ranked groups at the requested grouping level. Ranking is applied
 * independently within each ancestor partition.
 *
 * @param {GroupGroup} rootGroup
 * @param {number} level Zero-based grouping level
 * @param {"size"} measure Group-level measure
 * @param {number} limit Number of groups to retain per ancestor partition
 * @param {"descending" | "ascending"} order Ranking order
 */
export function retainGroupsByRank(rootGroup, level, measure, limit, order) {
    if (measure !== "size") {
        throw new Error("Unsupported group measure: " + measure);
    }

    applyToGroupParentsAtLevel(rootGroup, level, (parent) => {
        const rankedGroups = parent.groups
            .map((group, index) => ({
                group,
                index,
                size: getGroupSize(group),
            }))
            .sort((a, b) => {
                if (a.size !== b.size) {
                    return order === "descending"
                        ? b.size - a.size
                        : a.size - b.size;
                }

                return a.index - b.index;
            })
            .slice(0, limit);

        const retainedGroups = new Set(
            rankedGroups.map((entry) => entry.group)
        );
        parent.groups = parent.groups.filter((group) =>
            retainedGroups.has(group)
        );
    });
}

/**
 * Retains groups at the requested grouping level using a group-size predicate.
 *
 * @param {GroupGroup} rootGroup
 * @param {number} level Zero-based grouping level
 * @param {"size"} measure Group-level measure
 * @param {import("./payloadTypes.js").ComparisonOperatorType} operator
 * @param {number} operand
 */
export function retainGroupsBySize(
    rootGroup,
    level,
    measure,
    operator,
    operand
) {
    if (measure !== "size") {
        throw new Error("Unsupported group measure: " + measure);
    }

    const predicate = createComparisonPredicate(operator, operand);
    applyToGroupParentsAtLevel(rootGroup, level, (parent) => {
        parent.groups = parent.groups.filter((group) =>
            predicate(getGroupSize(group))
        );
    });
}

/**
 * @param {Group} group
 * @returns {number}
 */
function getGroupSize(group) {
    if (isGroupGroup(group)) {
        return group.groups.reduce(
            (sum, child) => sum + getGroupSize(child),
            0
        );
    }

    return group.samples.length;
}

/**
 * @param {GroupGroup} rootGroup
 * @param {number} level Zero-based grouping level
 * @param {(parent: GroupGroup) => void} operation
 */
function applyToGroupParentsAtLevel(rootGroup, level, operation) {
    if (!Number.isInteger(level) || level < 0) {
        throw new Error("Grouping level must be a non-negative integer.");
    }

    let foundLevel = false;

    /**
     * @param {GroupGroup} parent
     * @param {number} childLevel
     */
    const visitParent = (parent, childLevel) => {
        if (childLevel === level) {
            foundLevel = true;
            operation(parent);
        } else {
            for (const child of parent.groups) {
                if (isGroupGroup(child)) {
                    visitParent(child, childLevel + 1);
                }
            }
        }
    };

    visitParent(rootGroup, 0);

    if (!foundLevel) {
        throw new Error("Grouping level not found: " + level);
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

/**
 *
 * @param {function(any):any} fieldAccessor
 * @param {import("./payloadTypes.js").CustomGroups} groups
 */
export function makeCustomGroupAccessor(fieldAccessor, groups) {
    /**
     * @typedef {import("@genome-spy/core/spec/channel.js").Scalar} Scalar
     * @type {Map<Scalar, Scalar>}
     */
    const lookupTable = new Map();

    for (const [groupName, categories] of Object.entries(groups)) {
        for (const category of categories) {
            lookupTable.set(category, groupName);
        }
    }

    /**
     * @type {(datum: any) => Scalar}
     */
    return (datum) => lookupTable.get(fieldAccessor(datum));
}
