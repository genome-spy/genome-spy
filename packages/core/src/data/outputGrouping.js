import { splitAccessPath } from "vega-util";

/**
 * Guarantees for a primary output or a materialized snapshot.
 *
 * @typedef {object} OutputGrouping
 * @prop {readonly (readonly string[])[]} keys Ordered tuples of literal
 * top-level columns with string or finite numeric values. Each tuple has one
 * run per equal key within a facet or an unfaceted publication.
 * @prop {boolean} fileFree Whether the output omits physical file boundaries.
 */

/**
 * @param {OutputGrouping | undefined} grouping
 * @param {readonly string[]} writes Literal top-level output names
 * @returns {OutputGrouping | undefined}
 */
export function preserveGrouping(grouping, writes) {
    if (!grouping) return;
    const keys = grouping.keys.filter(
        (key) => !key.some((column) => writes.includes(column))
    );
    if (keys.length === grouping.keys.length) return grouping;
    if (keys.length) return { keys, fileFree: grouping.fileFree };
}

/**
 * @param {OutputGrouping | undefined} grouping
 * @param {readonly string[]} fields Field paths read by the consumer
 * @returns {readonly string[] | undefined}
 */
export function findContiguousKey(grouping, fields) {
    if (!grouping || !fields.length) return;
    const paths = fields.map(splitAccessPath);
    return grouping.keys.find(
        (key) =>
            key.length === paths.length &&
            key.every(
                (column, i) => paths[i].length === 1 && paths[i][0] === column
            )
    );
}
