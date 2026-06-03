/**
 * @typedef {import("@genome-spy/app/agentShared").Group} Group
 * @typedef {import("@genome-spy/app/agentShared").GroupGroup} GroupGroup
 * @typedef {{
 *     group: Group;
 *     path: string[];
 *     level: number;
 *     sampleCount: number;
 * }} SampleGroupPathEntry
 */

/**
 * @param {GroupGroup} group
 * @returns {SampleGroupPathEntry[]}
 */
export function listGroupEntries(group) {
    /** @type {SampleGroupPathEntry[]} */
    const entries = [];

    /**
     * @param {Group} group
     * @param {string[]} path
     * @param {number} level
     * @returns {number}
     */
    const visit = (group, path, level) => {
        const sampleCount =
            "samples" in group
                ? group.samples.length
                : group.groups.reduce(
                      (sum, child) =>
                          sum + visit(child, [...path, child.name], level + 1),
                      0
                  );
        entries.push({ group, path, level, sampleCount });
        return sampleCount;
    };

    for (const child of group.groups) {
        visit(child, [child.name], 1);
    }

    return entries;
}

/**
 * @param {GroupGroup} parentGroup
 * @param {string[]} parentPath
 * @returns {SampleGroupPathEntry[]}
 */
export function listChildGroupEntries(parentGroup, parentPath) {
    return parentGroup.groups.map((group) => ({
        group,
        path: [...parentPath, group.name],
        level: parentPath.length + 1,
        sampleCount: countSamples(group),
    }));
}

/**
 * @param {Group} group
 * @returns {number}
 */
function countSamples(group) {
    if ("samples" in group) {
        return group.samples.length;
    }

    return group.groups.reduce((sum, child) => sum + countSamples(child), 0);
}
