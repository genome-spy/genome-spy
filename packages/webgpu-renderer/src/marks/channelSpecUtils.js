/**
 * @typedef {object} ChannelSpec
 * @prop {import("../types.js").ScalarType} [type]
 * @prop {1|2|4} [components]
 * @prop {number|number[]} [default]
 * @prop {"identity"|"linear"} [scale]
 * @prop {boolean} [optional]
 */

/**
 * @param {Record<string, ChannelSpec>} specs
 * @returns {{
 *   channels: string[],
 *   defaults: Record<string, number|number[]>,
 *   defaultConfigs: Record<string, import("../index.d.ts").ChannelConfigInput>,
 *   optionalChannels: string[],
 * }}
 */
export function buildChannelMaps(specs) {
    /** @type {Record<string, number|number[]>} */
    const defaults = {};
    /** @type {Record<string, import("../index.d.ts").ChannelConfigInput>} */
    const defaultConfigs = {};
    /** @type {string[]} */
    const optionalChannels = [];

    for (const [name, spec] of Object.entries(specs)) {
        if (spec.optional) {
            optionalChannels.push(name);
        }
        if (spec.default !== undefined) {
            defaults[name] = spec.default;
        }
        /** @type {Record<string, unknown>} */
        const config = {};
        if (spec.type) {
            config.type = spec.type;
        }
        if (spec.components) {
            config.components = spec.components;
        }
        if (spec.scale) {
            config.scale = { type: spec.scale };
        }
        if (spec.default !== undefined) {
            config.value = spec.default;
        }
        if (Object.keys(config).length > 0) {
            defaultConfigs[name] =
                /** @type {import("../index.d.ts").ChannelConfigInput} */ (
                    config
                );
        }
    }

    return {
        channels: Object.keys(specs),
        defaults,
        defaultConfigs,
        optionalChannels,
    };
}
