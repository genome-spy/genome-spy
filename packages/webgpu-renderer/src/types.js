/**
 * @typedef {import("./index.d.ts").ChannelConfig} ChannelConfig
 * @typedef {import("./index.d.ts").ChannelConfigWithScale} ChannelConfigWithScale
 * @typedef {import("./index.d.ts").ChannelConfigWithoutScale} ChannelConfigWithoutScale
 * @typedef {import("./index.d.ts").BufferChannelConfig} BufferChannelConfig
 * @typedef {import("./index.d.ts").BufferChannelConfigWithScale} BufferChannelConfigWithScale
 * @typedef {import("./index.d.ts").UniformChannelConfig} UniformChannelConfig
 * @typedef {import("./index.d.ts").UniformChannelConfigWithScale} UniformChannelConfigWithScale
 */

/**
 * @param {ChannelConfig} config
 * @returns {config is ChannelConfigWithScale}
 */
export function isChannelConfigWithScale(config) {
    return !!config && "scale" in config && !!config.scale;
}

/**
 * @param {ChannelConfig} config
 * @returns {config is ChannelConfigWithoutScale}
 */
export function isChannelConfigWithoutScale(config) {
    return !isChannelConfigWithScale(config);
}

/**
 * @param {ChannelConfig} config
 * @returns {config is BufferChannelConfig | BufferChannelConfigWithScale}
 */
export function isBufferChannelConfig(config) {
    return !!config && "data" in config && config.data != null;
}

/**
 * @param {ChannelConfig} config
 * @returns {config is UniformChannelConfig | UniformChannelConfigWithScale}
 */
export function isUniformChannelConfig(config) {
    return !!config && "value" in config && config.value != null;
}
