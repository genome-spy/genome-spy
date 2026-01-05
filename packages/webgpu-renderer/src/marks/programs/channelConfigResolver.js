import { isSeriesChannelConfig, isValueChannelConfig } from "../../types.js";
import { buildChannelAnalysis } from "../shaders/channelAnalysis.js";
import { validateScaleConfig } from "../scales/scaleValidation.js";

/**
 * Input shape for channel configs as provided by callers.
 *
 * @typedef {import("../../index.d.ts").ChannelConfigInput} ChannelConfigInput
 */

/**
 * Normalized channel config after defaults/validation are applied.
 *
 * @typedef {import("../../index.d.ts").ChannelConfigResolved} ChannelConfigResolved
 */

/**
 * Static channel metadata (types/components/scale rules).
 *
 * @typedef {import("../utils/channelSpecUtils.js").ChannelSpec} ChannelSpec
 */

/**
 * Context bundle for channel normalization/validation.
 *
 * @typedef {object} ChannelConfigContext
 * @property {string[]} channelOrder
 * @property {string[]} optionalChannels
 * @property {Record<string, ChannelConfigInput>} defaultChannelConfigs
 * @property {Record<string, number|number[]>} defaultValues
 * @property {Record<string, ChannelSpec>} channelSpecs
 */

/**
 * Normalize channel configs, apply defaults, and validate them.
 *
 * @param {object} params
 * @param {Record<string, ChannelConfigInput> | undefined} params.channels
 * @param {ChannelConfigContext} params.context
 * @returns {Record<string, ChannelConfigResolved>}
 */
export function normalizeChannels({ channels, context }) {
    /** @type {Record<string, ChannelConfigResolved>} */
    const normalized = {};
    const { channelOrder } = context;

    for (const name of channelOrder) {
        const resolved = normalizeChannel({
            name,
            configChannel: channels?.[name],
            context,
        });
        if (resolved) {
            normalized[name] = resolved;
        }
    }

    return normalized;
}

/**
 * Normalize a single channel config: merge defaults, validate, and resolve
 * missing values.
 *
 * @param {object} params
 * @param {string} params.name
 * @param {ChannelConfigInput | undefined} params.configChannel
 * @param {ChannelConfigContext} params.context
 * @returns {ChannelConfigResolved | null}
 */
export function normalizeChannel({ name, configChannel, context }) {
    const {
        channelOrder,
        optionalChannels,
        defaultChannelConfigs,
        defaultValues,
        channelSpecs,
    } = context;
    const merged = /** @type {ChannelConfigInput} */ (
        /** @type {unknown} */ ({
            ...(defaultChannelConfigs[name] ?? {}),
            ...(configChannel ?? {}),
        })
    );

    if (!merged.components) {
        merged.components = 1;
    }
    if (isSeriesChannelConfig(merged) && !merged.inputComponents) {
        const scaleType = merged.scale?.type ?? "identity";
        merged.inputComponents =
            scaleType === "identity" ? merged.components : 1;
    }
    if (
        isSeriesChannelConfig(merged) &&
        (configChannel?.value !== undefined ||
            configChannel?.default !== undefined)
    ) {
        throw new Error(
            `Channel "${name}" must not specify both data and value.`
        );
    }
    if (isSeriesChannelConfig(merged)) {
        delete merged.value;
        delete merged.default;
    }
    // Provide sensible defaults early so downstream code can assume data or value.
    if (!isSeriesChannelConfig(merged) && merged.value === undefined) {
        if (merged.default !== undefined) {
            merged.value = merged.default;
        } else if (defaultValues[name] !== undefined) {
            merged.value = defaultValues[name];
        }
    }
    if (
        optionalChannels.includes(name) &&
        !isSeriesChannelConfig(merged) &&
        !isValueChannelConfig(merged)
    ) {
        return null;
    }

    validateChannel(name, merged, {
        channelOrder,
        optionalChannels,
        channelSpecs,
    });
    return /** @type {ChannelConfigResolved} */ (merged);
}

/**
 * Validate a channel config against its spec and scale requirements.
 *
 * @param {string} name
 * @param {ChannelConfigInput} channel
 * @param {Pick<ChannelConfigContext, "channelOrder"|"optionalChannels"|"channelSpecs">} context
 * @returns {void}
 */
export function validateChannel(name, channel, context) {
    const { channelOrder, optionalChannels, channelSpecs } = context;
    if (!channelOrder.includes(name)) {
        throw new Error(`Unknown channel: ${name}`);
    }
    const spec = channelSpecs[name];
    if (spec?.components && channel.components !== spec.components) {
        throw new Error(
            `Channel "${name}" must use ${spec.components} components`
        );
    }

    const analysis = buildChannelAnalysis(name, channel);
    const { scaleDef, outputComponents } = analysis;
    const allowsTypeOverride =
        scaleDef.allowsU32InputOverride === true &&
        spec?.type === "f32" &&
        channel.type === "u32" &&
        (outputComponents === 1 || outputComponents === 4);

    if (
        spec?.type &&
        channel.type &&
        channel.type !== spec.type &&
        !allowsTypeOverride
    ) {
        throw new Error(`Channel "${name}" must use type "${spec.type}"`);
    }
    if (
        optionalChannels.includes(name) &&
        !isSeriesChannelConfig(channel) &&
        !isValueChannelConfig(channel)
    ) {
        return;
    }
    if (isSeriesChannelConfig(channel)) {
        if (!channel.data) {
            throw new Error(`Missing data for channel "${name}"`);
        }
        if (!channel.type) {
            throw new Error(`Missing type for channel "${name}"`);
        }
    }
    if (isSeriesChannelConfig(channel) && isValueChannelConfig(channel)) {
        throw new Error(
            `Channel "${name}" must not specify both data and value.`
        );
    }
    if (!isSeriesChannelConfig(channel) && !isValueChannelConfig(channel)) {
        throw new Error(`Channel "${name}" must specify either data or value.`);
    }
    if (channel.components && ![1, 2, 4].includes(channel.components)) {
        throw new Error(`Invalid component count for "${name}"`);
    }
    if (
        channel.inputComponents &&
        ![1, 2, 4].includes(channel.inputComponents)
    ) {
        throw new Error(`Invalid input component count for "${name}"`);
    }

    const scaleError = validateScaleConfig(name, channel, analysis);
    if (scaleError) {
        throw new Error(scaleError);
    }
}
