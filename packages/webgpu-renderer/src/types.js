/**
 * @typedef {import("./index.d.ts").ChannelConfigInput} ChannelConfigInput
 * @typedef {import("./index.d.ts").ChannelConfigWithScaleInput} ChannelConfigWithScaleInput
 * @typedef {import("./index.d.ts").ChannelConfigWithoutScaleInput} ChannelConfigWithoutScaleInput
 * @typedef {import("./index.d.ts").SeriesChannelConfigInput} SeriesChannelConfigInput
 * @typedef {import("./index.d.ts").ValueChannelConfigInput} ValueChannelConfigInput
 * @typedef {import("./index.d.ts").ScalarType} ScalarType
 */

/**
 * @param {ChannelConfigInput} config
 * @returns {config is ChannelConfigWithScaleInput}
 */
export function isChannelConfigWithScale(config) {
    return !!config && "scale" in config && !!config.scale;
}

/**
 * @param {ChannelConfigInput} config
 * @returns {config is ChannelConfigWithoutScaleInput}
 */
export function isChannelConfigWithoutScale(config) {
    return !isChannelConfigWithScale(config);
}

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
