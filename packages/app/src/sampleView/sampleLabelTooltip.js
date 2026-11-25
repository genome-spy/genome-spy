import dataTooltipHandler from "@genome-spy/core/tooltip/dataTooltipHandler.js";
import { flattenDatumRows } from "@genome-spy/core/tooltip/flattenDatumRows.js";

export const SAMPLE_LABEL_TOOLTIP_HANDLER = "app:sample-label";

/**
 * @typedef {import("@genome-spy/core/tooltip/tooltipHandler.js").TooltipHandler} TooltipHandler
 */

/**
 * Preserves sample identifiers and display names in the sidebar's tooltip.
 *
 * @param {TooltipHandler} defaultHandler
 * @returns {TooltipHandler}
 */
export function createSampleLabelTooltipHandler(
    defaultHandler = dataTooltipHandler
) {
    return (datum, mark, params, context) => {
        const rows = context?.tooltipRows ?? flattenDatumRows(datum);

        return defaultHandler(datum, mark, params, {
            ...context,
            tooltipRows: rows.map((row) => {
                const field = row.sourceField ?? row.key;
                return typeof row.value === "string" &&
                    (field === "id" || field === "displayName")
                    ? { ...row, formatted: true }
                    : row;
            }),
        });
    };
}
