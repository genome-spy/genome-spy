import { isSeriesChannelConfig, isValueChannelConfig } from "../../types.js";
import { buildChannelAnalysis } from "../shaders/channelAnalysis.js";
import { getScaleInputRule, isScaleSupported } from "../scales/scaleDefs.js";
import { usesOrdinalDomainMap } from "../scales/domainRangeUtils.js";

/**
 * @typedef {import("../../index.d.ts").ChannelConfigInput} ChannelConfigInput
 * @typedef {import("../../index.d.ts").ChannelConfigResolved} ChannelConfigResolved
 * @typedef {import("../utils/channelSpecUtils.js").ChannelSpec} ChannelSpec
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
        merged.inputComponents = merged.components;
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
    const {
        scaleType,
        outputComponents,
        inputComponents,
        allowsScalarToVector,
        isContinuousScale,
        rangeIsFunction,
        rangeIsColor,
        isPiecewise,
    } = analysis;
    if (!isScaleSupported(scaleType)) {
        throw new Error(
            `Channel "${name}" uses unsupported scale "${scaleType}".`
        );
    }
    const allowsOrdinalTypeOverride =
        scaleType === "ordinal" &&
        spec?.type === "f32" &&
        outputComponents > 1 &&
        channel.type === "u32";
    const allowsBandTypeOverride =
        scaleType === "band" && spec?.type === "f32" && channel.type === "u32";
    const allowsIndexTypeOverride =
        scaleType === "index" && spec?.type === "f32" && channel.type === "u32";

    if (
        spec?.type &&
        channel.type &&
        channel.type !== spec.type &&
        !allowsOrdinalTypeOverride &&
        !allowsBandTypeOverride &&
        !allowsIndexTypeOverride
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
    if (
        channel.inputComponents &&
        channel.inputComponents > 1 &&
        channel.type &&
        channel.type !== "f32"
    ) {
        const allowPackedU32 =
            channel.type === "u32" &&
            channel.inputComponents === 2 &&
            scaleType === "index";
        if (!allowPackedU32) {
            throw new Error(
                `Only f32 vectors are supported for "${name}" input data.`
            );
        }
    }
    const inputRule = getScaleInputRule(scaleType);
    const resolvedType = channel.type ?? "f32";
    if (
        inputRule === "numeric" &&
        !["f32", "u32", "i32"].includes(resolvedType)
    ) {
        throw new Error(
            `Channel "${name}" requires numeric input for "${scaleType}" scale.`
        );
    }
    if (inputRule === "u32" && resolvedType !== "u32") {
        throw new Error(
            `Channel "${name}" requires u32 input for "${scaleType}" scale.`
        );
    }
    if (
        outputComponents > 1 &&
        channel.type &&
        channel.type !== "f32" &&
        !allowsScalarToVector
    ) {
        throw new Error(
            `Only f32 vectors are supported for "${name}" right now.`
        );
    }
    const allowsPackedScalarInput =
        inputComponents === 2 &&
        outputComponents === 1 &&
        channel.type === "u32" &&
        scaleType === "index";
    if (
        inputComponents !== outputComponents &&
        !allowsScalarToVector &&
        !allowsPackedScalarInput
    ) {
        throw new Error(
            `Channel "${name}" only supports mismatched input/output components when mapping scalars to vectors.`
        );
    }
    if (rangeIsFunction) {
        if (!isContinuousScale) {
            throw new Error(
                `Channel "${name}" only supports function ranges with continuous scales.`
            );
        }
        if (outputComponents !== 4) {
            throw new Error(
                `Channel "${name}" requires vec4 outputs when using function ranges.`
            );
        }
    }
    if (channel.scale?.interpolate !== undefined) {
        if (!rangeIsColor) {
            throw new Error(
                `Channel "${name}" requires a color range when interpolate is set.`
            );
        }
        if (!isContinuousScale) {
            throw new Error(
                `Channel "${name}" only supports color interpolation with continuous scales.`
            );
        }
        if (outputComponents !== 4) {
            throw new Error(
                `Channel "${name}" requires vec4 outputs when using color interpolation.`
            );
        }
    }
    if (
        isContinuousScale &&
        !rangeIsFunction &&
        rangeIsColor &&
        outputComponents !== 4
    ) {
        throw new Error(
            `Channel "${name}" requires vec4 outputs when using color ranges.`
        );
    }

    if (channel.scale?.type === "threshold") {
        const domain = channel.scale.domain;
        const range = channel.scale.range;
        if (!Array.isArray(domain) || domain.length === 0) {
            throw new Error(
                `Threshold scale on "${name}" requires a non-empty domain.`
            );
        }
        if (!Array.isArray(range) || range.length < 2) {
            throw new Error(
                `Threshold scale on "${name}" requires at least two range entries.`
            );
        }
        if (range.length !== domain.length + 1) {
            throw new Error(
                `Threshold scale on "${name}" requires range length of ${
                    domain.length + 1
                }, got ${range.length}.`
            );
        }
        if (inputComponents !== 1) {
            throw new Error(
                `Threshold scale on "${name}" requires scalar input values.`
            );
        }
    }
    if (isPiecewise) {
        const domain = channel.scale?.domain;
        const range = channel.scale?.range;
        if (!Array.isArray(domain) || domain.length < 2) {
            throw new Error(
                `Piecewise scale on "${name}" requires at least two domain entries.`
            );
        }
        if (!Array.isArray(range) || range.length < 2) {
            throw new Error(
                `Piecewise scale on "${name}" requires at least two range entries.`
            );
        }
        if (domain.length !== range.length) {
            throw new Error(
                `Piecewise scale on "${name}" requires range length of ${domain.length}, got ${range.length}.`
            );
        }
        if (inputComponents !== 1) {
            throw new Error(
                `Piecewise scale on "${name}" requires scalar input values.`
            );
        }
    }
    if (channel.scale?.type === "ordinal") {
        const range = channel.scale?.range;
        if (!Array.isArray(range) || range.length === 0) {
            throw new Error(
                `Ordinal scale on "${name}" requires a non-empty range.`
            );
        }
        if (
            !Array.isArray(channel.scale.domain) &&
            !ArrayBuffer.isView(channel.scale.domain)
        ) {
            throw new Error(
                `Ordinal scale on "${name}" requires an explicit domain array.`
            );
        }
        if (inputComponents !== 1) {
            throw new Error(
                `Ordinal scale on "${name}" requires scalar input values.`
            );
        }
        if (isValueChannelConfig(channel)) {
            if (Array.isArray(channel.value)) {
                throw new Error(
                    `Ordinal scale on "${name}" requires scalar integer values.`
                );
            }
            if (
                typeof channel.value === "number" &&
                !Number.isInteger(channel.value)
            ) {
                throw new Error(
                    `Ordinal scale on "${name}" requires integer values.`
                );
            }
        }
        if (
            isValueChannelConfig(channel) &&
            outputComponents > 1 &&
            Array.isArray(channel.value)
        ) {
            throw new Error(
                `Ordinal scale on "${name}" requires scalar input values for vector outputs.`
            );
        }
    }
    if (
        scaleType === "band" &&
        !Array.isArray(channel.scale?.domain) &&
        !ArrayBuffer.isView(channel.scale?.domain)
    ) {
        throw new Error(
            `Band scale on "${name}" requires an explicit domain array.`
        );
    }
    if (usesOrdinalDomainMap(channel.scale)) {
        if (scaleType === "band" && inputComponents !== 1) {
            throw new Error(
                `Band scale on "${name}" requires scalar inputs when using an ordinal domain.`
            );
        }
        if (
            scaleType === "band" &&
            isValueChannelConfig(channel) &&
            typeof channel.value === "number" &&
            !Number.isInteger(channel.value)
        ) {
            throw new Error(
                `Band scale on "${name}" requires integer values when using an ordinal domain.`
            );
        }
    }
}
