import { mergeConfigScopes } from "./mergeConfig.js";

/** @type {Record<import("../spec/channel.js").PrimaryPositionalChannel, keyof import("../spec/config.js").GenomeSpyConfig>} */
const CHANNEL_BUCKETS = {
    x: "axisX",
    y: "axisY",
};

/** @type {Record<import("../spec/axis.js").AxisOrient, keyof import("../spec/config.js").GenomeSpyConfig>} */
const ORIENT_BUCKETS = {
    top: "axisTop",
    bottom: "axisBottom",
    left: "axisLeft",
    right: "axisRight",
};

/** @type {Partial<Record<import("../spec/channel.js").Type, keyof import("../spec/config.js").GenomeSpyConfig>>} */
const TYPE_BUCKETS = {
    nominal: "axisNominal",
    ordinal: "axisOrdinal",
    quantitative: "axisQuantitative",
    index: "axisIndex",
    locus: "axisLocus",
};

/**
 * @param {import("../spec/config.js").GenomeSpyConfig[]} scopes
 * @param {object} options
 * @param {import("../spec/channel.js").PrimaryPositionalChannel} options.channel
 * @param {import("../spec/axis.js").AxisOrient} [options.orient]
 * @param {import("../spec/channel.js").Type} [options.type]
 * @returns {import("../spec/config.js").AxisConfig}
 */
export function getConfiguredAxisDefaults(scopes, { channel, orient, type }) {
    return /** @type {import("../spec/config.js").AxisConfig} */ (
        mergeConfigScopes(
            scopes.flatMap((scope) => {
                const channelBucket = CHANNEL_BUCKETS[channel];
                const orientBucket = orient
                    ? ORIENT_BUCKETS[orient]
                    : undefined;
                const typeBucket = type ? TYPE_BUCKETS[type] : undefined;

                return [
                    /** @type {Record<string, any> | undefined} */ (scope.axis),
                    /** @type {Record<string, any> | undefined} */ (
                        channelBucket ? scope[channelBucket] : undefined
                    ),
                    /** @type {Record<string, any> | undefined} */ (
                        orientBucket ? scope[orientBucket] : undefined
                    ),
                    /** @type {Record<string, any> | undefined} */ (
                        typeBucket ? scope[typeBucket] : undefined
                    ),
                ];
            })
        )
    );
}
