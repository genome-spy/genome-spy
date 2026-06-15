/**
 * @typedef {object} LegendEntry
 * @prop {string | number | boolean} value
 * @prop {string} label
 * @prop {number} _legendIndex
 */

/**
 * Creates symbol legend entries from a discrete scale resolution.
 *
 * @param {Pick<import("../../scales/scaleResolution.js").default, "getDomain">} resolution
 * @returns {LegendEntry[]}
 */
export function createDiscreteLegendEntries(resolution) {
    return resolution.getDomain().map((value, index) => ({
        value,
        label: String(value),
        _legendIndex: index,
    }));
}
