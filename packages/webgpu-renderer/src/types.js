/**
 * @typedef {import("./index.d.ts").ChannelConfigInput} ChannelConfigInput
 * @typedef {import("./index.d.ts").SeriesChannelConfigInput} SeriesChannelConfigInput
 * @typedef {import("./index.d.ts").ValueChannelConfigInput} ValueChannelConfigInput
 * @typedef {import("./index.d.ts").ScalarType} ScalarType
 */

/**
 * @param {ChannelConfigInput} config
 * @returns {config is SeriesChannelConfigInput}
 */
export function isSeriesChannelConfig(config) {
    return !!config && "data" in config && config.data != null;
}

/**
 * @param {ChannelConfigInput} config
 * @returns {config is ValueChannelConfigInput}
 */
export function isValueChannelConfig(config) {
    return !!config && "value" in config && config.value != null;
}

/**
 * @param {unknown} value
 * @returns {value is Exclude<import("./index.d.ts").NumericValue, number>}
 */
export function isNumericArray(value) {
    if (Array.isArray(value)) return true;
    if (!ArrayBuffer.isView(value)) return false;
    const type = Object.prototype.toString.call(value);
    return (
        type !== "[object DataView]" &&
        type !== "[object BigInt64Array]" &&
        type !== "[object BigUint64Array]"
    );
}
