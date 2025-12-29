/**
 * @typedef {import("./index.d.ts").ChannelConfigInput} ChannelConfigInput
 * @typedef {import("./index.d.ts").ChannelConfigWithScaleInput} ChannelConfigWithScaleInput
 * @typedef {import("./index.d.ts").ChannelConfigWithoutScaleInput} ChannelConfigWithoutScaleInput
 * @typedef {import("./index.d.ts").SeriesChannelConfigWithScaleInput} SeriesChannelConfigWithScaleInput
 * @typedef {import("./index.d.ts").SeriesChannelConfigWithoutScaleInput} SeriesChannelConfigWithoutScaleInput
 * @typedef {import("./index.d.ts").ValueChannelConfigWithScaleInput} ValueChannelConfigWithScaleInput
 * @typedef {import("./index.d.ts").ValueChannelConfigWithoutScaleInput} ValueChannelConfigWithoutScaleInput
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
 * @returns {config is SeriesChannelConfigWithScaleInput | SeriesChannelConfigWithoutScaleInput}
 */
export function isBufferChannelConfig(config) {
    return !!config && "data" in config && config.data != null;
}

/**
 * @param {ChannelConfigInput} config
 * @returns {config is ValueChannelConfigWithScaleInput | ValueChannelConfigWithoutScaleInput}
 */
export function isUniformChannelConfig(config) {
    return !!config && "value" in config && config.value != null;
}
