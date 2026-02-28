import {
    getConfiguredScaleDefaults,
    getConfiguredScaleConfig,
} from "./scaleConfig.js";

/**
 * @param {import("../spec/channel.js").Channel} channel
 * @param {import("../spec/channel.js").Type} dataType
 * @param {boolean} isExplicitDomain
 * @param {import("../spec/config.js").GenomeSpyConfig[]} configScopes
 * @param {import("../spec/mark.js").MarkType[]} [markTypes]
 * @param {boolean} [hasDomainMid]
 * @returns {import("../spec/scale.js").Scale}
 */
export function getDefaultScaleProperties(
    channel,
    dataType,
    isExplicitDomain,
    configScopes,
    markTypes,
    hasDomainMid
) {
    return getConfiguredScaleDefaults(configScopes, {
        channel,
        dataType,
        isExplicitDomain,
        markTypes,
        hasDomainMid,
    });
}

/**
 * @param {import("../spec/channel.js").Type} dataType
 * @param {import("../spec/config.js").GenomeSpyConfig[]} configScopes
 * @returns {import("../spec/config.js").ScaleConfig}
 */
export function getScaleConfig(dataType, configScopes) {
    return getConfiguredScaleConfig(configScopes, dataType);
}
