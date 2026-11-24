/** @typedef {import("./flowNode.js").Datum} Datum */

/**
 * Partition rows by their full key tuple, in order of first occurrence.
 * @param {Datum[]} rows
 * @param {((datum: Datum) => any)[]} accessors
 * @returns {Datum[][]}
 */
export default function partitionRows(rows, accessors) {
    let groups = [rows];
    let reorder = false;
    // Refine only groups that can split. Singleton groups need no nested maps.
    for (const accessor of accessors) {
        const refined = [];
        for (const group of groups) {
            if (group.length === 1) {
                accessor(group[0]);
                refined.push(group);
                continue;
            }

            for (const subgroup of Map.groupBy(group, accessor).values()) {
                refined.push(subgroup);
            }
        }
        reorder ||= groups.length > 1 && refined.length > groups.length;
        groups = refined;
    }

    if (!reorder) return groups;

    // Refinement orders groups by prefix. Restore the order of complete keys.
    const byFirstRow = new Map();
    for (const group of groups) byFirstRow.set(group[0], group);
    groups.length = 0;
    for (const datum of rows) {
        const partition = byFirstRow.get(datum);
        if (partition) {
            groups.push(partition);
            byFirstRow.delete(datum);
        }
    }

    return groups;
}
