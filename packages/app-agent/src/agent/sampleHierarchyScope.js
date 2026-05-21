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
 * @returns {import("./agentContextTypes.js").AgentVisibleSampleGroupSource[]}
 */
export function collectVisibleSampleGroups(rootGroup) {
    if (!rootGroup) {
        return [];
    }

    /** @type {import("./agentContextTypes.js").AgentVisibleSampleGroupSource[]} */
    const groups = [];

    /**
     * @param {import("@genome-spy/app/agentShared").Group} group
     * @param {string[]} path
     * @param {string[]} titles
     * @param {(string | undefined)[]} generatedTitles
     */
    const visit = (group, path, titles, generatedTitles) => {
        if ("samples" in group) {
            const hasGeneratedTitle = generatedTitles.some(
                (title) => title !== undefined
            );
            groups.push({
                path,
                titles,
                ...(hasGeneratedTitle
                    ? {
                          generatedTitles: generatedTitles.map(
                              (title, i) => title ?? titles[i]
                          ),
                      }
                    : {}),
                title: group.title,
                sampleIds: [...group.samples],
            });
            return;
        }

        for (const child of group.groups) {
            visit(
                child,
                [...path, child.name],
                [...titles, child.title],
                [...generatedTitles, child.generatedTitle]
            );
        }
    };

    if ("samples" in rootGroup) {
        visit(rootGroup, [], [], []);
    } else {
        for (const child of rootGroup.groups) {
            visit(child, [child.name], [child.title], [child.generatedTitle]);
        }
    }

    return groups;
}
