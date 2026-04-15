/**
 * Collects the distinct sample ids represented by the current analysis-visible
 * hierarchy.
 *
 * @param {import("../sampleView/state/sampleState.d.ts").Group | undefined} rootGroup
 * @returns {string[]}
 */
export function collectVisibleSampleIds(rootGroup) {
    if (!rootGroup) {
        return [];
    }

    /** @type {Set<string>} */
    const sampleIds = new Set();

    /**
     * @param {import("../sampleView/state/sampleState.d.ts").Group} group
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
