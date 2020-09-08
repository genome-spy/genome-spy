import { compare } from "vega-util";

/**
 * @typedef {import("../../spec/transform").SortConfig} SortConfig
 */

/**
 *
 * @param {SortConfig} config
 * @param {Record<string, any>[]} rows
 */
export default function sortTransform(config, rows) {
    const comparator = compare(config.sort.field, config.sort.order);

    // Should return a copy but...
    rows.sort(comparator);

    return rows;
}
