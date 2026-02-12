/**
 * @typedef {import("./tooltipHandler.js").TooltipContext} TooltipContext
 * @typedef {import("./tooltipHandler.js").TooltipRow} TooltipRow
 */

/**
 * Creates a stable context object for tooltip handlers.
 *
 * @param {Record<string, any>} datum
 * @param {import("../marks/mark.js").default} mark
 * @param {import("./tooltipHandler.js").TooltipHandlerParams} [params]
 * @returns {TooltipContext}
 */
export default function createTooltipContext(datum, mark, params) {
    /** @type {TooltipRow[]} */
    const rows = [];
    collectRows(Object.entries(datum), rows);

    /** @type {TooltipRow[]} */
    const genomicRows = [];

    return {
        rows,
        getRows: () => rows,
        hiddenRowKeys: [],
        genomicRows,
        getGenomicRows: () => genomicRows,
    };
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
