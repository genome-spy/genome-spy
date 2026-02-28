import {
    isColorChannel,
    isDiscreteChannel,
    isPositionalChannel,
} from "../encoder/encoder.js";
import { mergeConfigScopes } from "./mergeConfig.js";

/** @type {Record<string, keyof import("../spec/config.js").ScaleConfig>} */
const COLOR_SCHEME_KEYS = {
    nominal: "nominalColorScheme",
    ordinal: "ordinalColorScheme",
    quantitative: "quantitativeColorScheme",
    index: "indexColorScheme",
    locus: "locusColorScheme",
};

const HEATMAP_MARK_TYPES = new Set(["rect"]);

/**
 * @param {import("../spec/channel.js").Type} dataType
 * @returns {keyof import("../spec/config.js").ScaleConfig | undefined}
 */
function getDataTypeBucket(dataType) {
    if (
        ["nominal", "ordinal", "quantitative", "index", "locus"].includes(
            dataType
        )
    ) {
        return /** @type {keyof import("../spec/config.js").ScaleConfig} */ (
            dataType
        );
    }
}

/**
 * @param {import("../spec/config.js").ScaleConfig | undefined} scaleConfig
 */
function getBaseScaleConfig(scaleConfig) {
    if (!scaleConfig) {
        return {};
    }

    const base = /** @type {Record<string, any>} */ ({ ...scaleConfig });
    for (const key of [
        "nominal",
        "ordinal",
        "quantitative",
        "index",
        "locus",
        "nominalColorScheme",
        "ordinalColorScheme",
        "quantitativeColorScheme",
        "quantitativeHeatmapColorScheme",
        "quantitativeRampColorScheme",
        "indexColorScheme",
        "locusColorScheme",
    ]) {
        delete base[key];
    }

    return base;
}

/**
 * @param {import("../spec/config.js").GenomeSpyConfig[]} scopes
 * @param {import("../spec/channel.js").Type} dataType
 * @returns {import("../spec/config.js").ScaleConfig}
 */
export function getConfiguredScaleConfig(scopes, dataType) {
    const dataTypeBucket = getDataTypeBucket(dataType);

    return /** @type {import("../spec/config.js").ScaleConfig} */ (
        mergeConfigScopes(
            scopes.map((scope) => {
                const scale = scope.scale;
                const typedScale =
                    scale && dataTypeBucket
                        ? /** @type {Record<string, any>} */ (
                              scale[dataTypeBucket]
                          )
                        : undefined;

                return /** @type {Record<string, any>} */ (
                    mergeConfigScopes([
                        /** @type {Record<string, any> | undefined} */ (scale),
                        typedScale,
                    ])
                );
            })
        )
    );
}

/**
 * @param {import("../spec/config.js").GenomeSpyConfig[]} scopes
 * @returns {import("../spec/config.js").RangeConfig}
 */
export function getConfiguredRangeConfig(scopes) {
    return /** @type {import("../spec/config.js").RangeConfig} */ (
        mergeConfigScopes(
            scopes.map(
                (scope) =>
                    /** @type {Record<string, any> | undefined} */ (scope.range)
            )
        )
    );
}

/**
 * @param {import("../spec/config.js").GenomeSpyConfig[]} scopes
 * @param {object} options
 * @param {import("../spec/channel.js").Channel} options.channel
 * @param {import("../spec/channel.js").Type} options.dataType
 * @param {boolean} options.isExplicitDomain
 * @param {import("../spec/mark.js").MarkType[]} [options.markTypes]
 * @returns {import("../spec/scale.js").Scale}
 */
export function getConfiguredScaleDefaults(
    scopes,
    { channel, dataType, isExplicitDomain, markTypes }
) {
    const scaleConfig = getConfiguredScaleConfig(scopes, dataType);
    const rangeConfig = getConfiguredRangeConfig(scopes);

    /** @type {import("../spec/scale.js").Scale} */
    const props = {
        ...getBaseScaleConfig(scaleConfig),
    };

    if (isExplicitDomain) {
        props.zero = false;
    } else if (props.zero === undefined && scaleConfig.zero !== undefined) {
        props.zero = scaleConfig.zero;
    }

    if (isPositionalChannel(channel) && props.nice === undefined) {
        props.nice =
            scaleConfig.nice !== undefined
                ? scaleConfig.nice
                : !isExplicitDomain;
    }

    if (isColorChannel(channel) && props.scheme === undefined) {
        let schemeKey =
            COLOR_SCHEME_KEYS[dataType] ?? COLOR_SCHEME_KEYS.quantitative;

        if (
            dataType == "quantitative" &&
            markTypes?.length &&
            markTypes.every((markType) => HEATMAP_MARK_TYPES.has(markType))
        ) {
            schemeKey = "quantitativeHeatmapColorScheme";
        } else if (dataType == "quantitative" && markTypes?.length) {
            schemeKey = "quantitativeRampColorScheme";
        }

        const configuredScheme = scaleConfig[schemeKey];
        if (
            configuredScheme === undefined &&
            (schemeKey == "quantitativeHeatmapColorScheme" ||
                schemeKey == "quantitativeRampColorScheme")
        ) {
            props.scheme =
                /** @type {import("../spec/scale.js").SchemeParams | string | undefined} */ (
                    scaleConfig.quantitativeColorScheme
                );
        } else if (
            typeof configuredScheme == "string" ||
            (configuredScheme && typeof configuredScheme == "object")
        ) {
            props.scheme =
                /** @type {import("../spec/scale.js").SchemeParams | string} */ (
                    configuredScheme
                );
        }
    } else if (isDiscreteChannel(channel) && props.range === undefined) {
        props.range = channel == "shape" ? (rangeConfig.shape ?? []) : [];
    } else if (channel == "size" && props.range === undefined) {
        props.range = rangeConfig.size;
    } else if (channel == "angle" && props.range === undefined) {
        props.range = rangeConfig.angle;
    }

    return props;
}
