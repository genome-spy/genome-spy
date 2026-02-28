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
 * @param {unknown} scheme
 * @returns {scheme is import("../spec/scale.js").SchemeParams | string}
 */
function isConfiguredScheme(scheme) {
    return (
        typeof scheme == "string" ||
        (scheme != null && typeof scheme == "object")
    );
}

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
 * @param {boolean} [options.hasDomainMid]
 * @returns {import("../spec/scale.js").Scale}
 */
export function getConfiguredScaleDefaults(
    scopes,
    { channel, dataType, isExplicitDomain, markTypes, hasDomainMid }
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
        if (dataType == "quantitative") {
            const useDiverging =
                hasDomainMid || scaleConfig.domainMid !== undefined;

            // Mirror Vega-Lite defaults for quantitative color scales:
            // domainMid -> diverging, rect-like marks -> heatmap, others -> ramp.
            // TODO: Add support for Vega-Lite-style named string ranges in
            // scale.range (e.g. "diverging"). For now, config.range.* values
            // are interpreted directly as scheme values.
            const rangeScheme = useDiverging
                ? rangeConfig.diverging
                : markTypes?.length &&
                    markTypes.every((markType) =>
                        HEATMAP_MARK_TYPES.has(markType)
                    )
                  ? rangeConfig.heatmap
                  : rangeConfig.ramp;

            const configuredScheme = isConfiguredScheme(rangeScheme)
                ? rangeScheme
                : scaleConfig.quantitativeColorScheme;

            if (isConfiguredScheme(configuredScheme)) {
                props.scheme = configuredScheme;
            }
        } else {
            const schemeKey =
                COLOR_SCHEME_KEYS[dataType] ?? COLOR_SCHEME_KEYS.quantitative;
            const configuredScheme = scaleConfig[schemeKey];

            if (isConfiguredScheme(configuredScheme)) {
                props.scheme = configuredScheme;
            }
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
