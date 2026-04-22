/**
 * Collects the distinct sample ids represented by the current analysis-visible
 * hierarchy.
 *
 * @param {import("@genome-spy/app/agentShared").Group | undefined} rootGroup
 * @returns {string[]}
 */
export function collectVisibleSampleIds(rootGroup) {
    if (!rootGroup) {
        return [];
    }

    /** @type {Set<string>} */
    const sampleIds = new Set();

    /**
     * @param {import("@genome-spy/app/agentShared").Group} group
     */
    const visit = (group) => {
        if ("samples" in group) {
            for (const sampleId of group.samples) {
                sampleIds.add(sampleId);
            }
            return;
        }

        for (const child of group.groups) {
            visit(child);
        }
    };

    visit(rootGroup);

    return Array.from(sampleIds);
}

/**
 * Collects the visible leaf groups from the current analysis hierarchy.
 *
 * @param {import("@genome-spy/app/agentShared").Group | undefined} rootGroup
 * @returns {Array<{
 *     path: string[];
 *     titles: string[];
 *     title: string;
 *     sampleIds: string[];
 * }>}
 */
export function collectVisibleSampleGroups(rootGroup) {
    if (!rootGroup) {
        return [];
    }

    /** @type {Array<{ path: string[]; titles: string[]; title: string; sampleIds: string[] }>} */
    const groups = [];

    /**
     * @param {import("@genome-spy/app/agentShared").Group} group
     * @param {string[]} path
     * @param {string[]} titles
     */
    const visit = (group, path, titles) => {
        if ("samples" in group) {
            groups.push({
                path,
                titles,
                title: group.title,
                sampleIds: [...group.samples],
            });
            return;
        }

        for (const child of group.groups) {
            visit(child, [...path, child.name], [...titles, child.title]);
        }
    };

    if ("samples" in rootGroup) {
        visit(rootGroup, [], []);
    } else {
        for (const child of rootGroup.groups) {
            visit(child, [child.name], [child.title]);
        }
    }

    return groups;
}
