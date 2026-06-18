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
 * @param {(value: import("../../spec/channel.js").Scalar) => string} [format]
 * @returns {LegendEntry[]}
 */
export function createDiscreteLegendEntries(resolution, format = String) {
    return resolution.getDomain().map((value, index) => ({
        value,
        label: format(value),
        _legendIndex: index,
    }));
}
