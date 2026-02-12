/**
 * @typedef {import("./tooltipHandler.js").TooltipRow} TooltipRow
 */

/**
 * Flattens an object into tooltip rows using dot-separated keys.
 * Keys starting with "_" are omitted.
 *
 * @param {Record<string, any>} datum
 * @returns {TooltipRow[]}
 */
export function flattenDatumRows(datum) {
    /** @type {TooltipRow[]} */
    const rows = [];
    collectRows(Object.entries(datum), rows);
    return rows;
}

/**
 * @param {[string, any][]} entries
 * @param {TooltipRow[]} output
 * @param {string} [prefix]
 */
function collectRows(entries, output, prefix) {
    for (const [key, value] of entries) {
        if (key.startsWith("_")) {
            continue;
        }

        if (
            value !== null &&
            typeof value === "object" &&
            !Array.isArray(value)
        ) {
            collectRows(
                Object.entries(value),
                output,
                (prefix ? prefix : "") + key + "."
            );
        } else {
            output.push({
                key: (prefix ? prefix : "") + key,
                value: value,
            });
        }
    }
}
