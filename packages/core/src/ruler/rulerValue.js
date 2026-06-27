/**
 * @typedef {import("../spec/channel.js").PrimaryPositionalChannel} PrimaryPositionalChannel
 * @typedef {import("../spec/parameter.js").RulerInitMapping} RulerInitMapping
 * @typedef {import("../spec/parameter.js").RulerValue} RulerValue
 */

/**
 * Creates a tagged ruler parameter value.
 *
 * @param {PrimaryPositionalChannel[]} [channels]
 * @param {RulerInitMapping} [init]
 * @returns {RulerValue}
 */
export function createRulerValue(channels = ["x"], init = {}) {
    /** @type {RulerValue["values"]} */
    const values = {};

    for (const channel of channels) {
        values[channel] = init[channel] ?? null;
    }

    return {
        type: "ruler",
        values,
    };
}

/**
 * @param {any} value
 * @returns {value is RulerValue}
 */
export function isRulerValue(value) {
    return (
        value != null &&
        typeof value == "object" &&
        value.type === "ruler" &&
        value.values != null &&
        typeof value.values == "object"
    );
}

/**
 * @param {any} value
 * @param {PrimaryPositionalChannel} channel
 */
export function isActiveRulerValue(value, channel) {
    return isRulerValue(value) && value.values[channel] != null;
}
