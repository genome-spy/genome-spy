import { isSeriesChannelConfig, isValueChannelConfig } from "../../../types.js";
import { buildChannelAnalysis } from "../../shaders/channelAnalysis.js";
import { validateScaleConfig } from "../../scales/scaleValidation.js";

/**
 * Input shape for channel configs as provided by callers.
 *
 * @typedef {import("../../../index.d.ts").ChannelConfigInput} ChannelConfigInput
 * @typedef {import("../../../index.d.ts").ConditionalChannelConfigInput} ConditionalChannelConfigInput
 * @typedef {import("../../../index.d.ts").ChannelCondition} ChannelCondition
 */

/**
 * Normalized channel config after defaults/validation are applied.
 *
 * @typedef {import("../../../index.d.ts").ChannelConfigResolved} ChannelConfigResolved
 */

/**
 * Static channel metadata (types/components/scale rules).
 *
 * @typedef {import("../../utils/channelSpecUtils.js").ChannelSpec} ChannelSpec
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
 * @returns {{ channels: Record<string, ChannelConfigResolved>, analysisByChannel: Map<string, ReturnType<typeof buildChannelAnalysis>> }}
 */
export function normalizeChannels({ channels, context }) {
    /** @type {Record<string, ChannelConfigResolved>} */
    const normalized = {};
    /** @type {Map<string, ReturnType<typeof buildChannelAnalysis>>} */
    const analysisByChannel = new Map();
    const { channelOrder } = context;

    for (const name of channelOrder) {
        const resolved = normalizeChannel({
            name,
            configChannel: channels?.[name],
            context,
        });
        if (resolved) {
            normalized[name] = resolved.channel;
            analysisByChannel.set(name, resolved.analysis);
        }
    }

    normalizeChannelConditions(normalized, analysisByChannel, context);
    return { channels: normalized, analysisByChannel };
}

/**
 * Normalize a single channel config: merge defaults, validate, and resolve
 * missing values.
 *
 * @param {object} params
 * @param {string} params.name
 * @param {ChannelConfigInput | undefined} params.configChannel
 * @param {ChannelConfigContext} params.context
 * @returns {{ channel: ChannelConfigResolved, analysis: ReturnType<typeof buildChannelAnalysis> } | null}
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

    const analysis = validateChannel(name, merged, {
        channelOrder,
        optionalChannels,
        channelSpecs,
    });
    return {
        channel: /** @type {ChannelConfigResolved} */ (merged),
        analysis,
    };
}

/**
 * Normalize conditional channel configs and attach them as synthetic channels.
 *
 * @param {Record<string, ChannelConfigResolved>} channels
 * @param {Map<string, ReturnType<typeof buildChannelAnalysis>>} analysisByChannel
 * @param {ChannelConfigContext} context
 * @returns {void}
 */
function normalizeChannelConditions(channels, analysisByChannel, context) {
    let conditionIndex = 0;
    for (const [name, channel] of Object.entries(channels)) {
        const conditions = channel.conditions ?? [];
        if (!conditions.length) {
            continue;
        }
        /** @type {ChannelCondition[]} */
        const resolvedConditions = [];
        for (const condition of conditions) {
            const normalizedCondition = /** @type {ChannelCondition} */ ({
                ...condition,
                when: normalizeSelectionPredicate(condition.when),
            });
            if (!("channel" in condition) || !condition.channel) {
                resolvedConditions.push(normalizedCondition);
                continue;
            }
            const conditionName = `${name}__cond${conditionIndex++}`;
            const resolved = normalizeConditionChannel({
                name,
                analysisName: conditionName,
                configChannel: condition.channel,
                context,
            });
            channels[conditionName] = resolved.channel;
            analysisByChannel.set(conditionName, resolved.analysis);
            resolvedConditions.push(
                /** @type {ChannelCondition} */ ({
                    ...normalizedCondition,
                    channelName: conditionName,
                })
            );
        }
        channel.conditions = resolvedConditions;
    }
}

/**
 * Copy a selection predicate while adding the ranged-target default only when
 * a second input makes the target a ranged datum.
 *
 * @param {ChannelCondition["when"]} when
 * @returns {ChannelCondition["when"]}
 */
function normalizeSelectionPredicate(when) {
    if (when.type !== "interval") {
        return { ...when };
    }

    return {
        ...when,
        targets: when.targets.map((target) => ({
            ...target,
            ...(target.secondaryInput !== undefined &&
            target.hitTest === undefined
                ? { hitTest: "intersects" }
                : {}),
        })),
    };
}

/**
 * Normalize and validate a conditional channel config without applying defaults.
 *
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.analysisName
 * @param {ConditionalChannelConfigInput} params.configChannel
 * @param {ChannelConfigContext} params.context
 * @returns {{ channel: ChannelConfigResolved, analysis: ReturnType<typeof buildChannelAnalysis> }}
 */
function normalizeConditionChannel({
    name,
    analysisName,
    configChannel,
    context,
}) {
    const { channelOrder, channelSpecs } = context;
    const merged = /** @type {ChannelConfigInput} */ (
        /** @type {unknown} */ ({
            ...(configChannel ?? {}),
        })
    );

    if (merged.conditions !== undefined) {
        throw new Error(
            `Channel "${name}" conditions must not nest other conditions.`
        );
    }
    if (merged.default !== undefined) {
        throw new Error(
            `Channel "${name}" conditions must not include defaults.`
        );
    }
    if (!merged.components) {
        merged.components = channelSpecs[name]?.components ?? 1;
    }
    if (isSeriesChannelConfig(merged) && !merged.inputComponents) {
        const scaleType = merged.scale?.type ?? "identity";
        merged.inputComponents =
            scaleType === "identity" ? merged.components : 1;
    }
    if (isSeriesChannelConfig(merged) && merged.value !== undefined) {
        throw new Error(
            `Channel "${name}" conditions must not specify both data and value.`
        );
    }
    if (!isSeriesChannelConfig(merged) && merged.value === undefined) {
        throw new Error(
            `Channel "${name}" conditions must specify either data or value.`
        );
    }
    if (isSeriesChannelConfig(merged)) {
        delete merged.value;
        delete merged.default;
    }
    const analysis = validateChannel(
        name,
        merged,
        {
            channelOrder,
            optionalChannels: [],
            channelSpecs,
        },
        analysisName
    );
    return {
        channel: /** @type {ChannelConfigResolved} */ (merged),
        analysis,
    };
}

/**
 * Validate a channel config against its spec and scale requirements.
 *
 * @param {string} name
 * @param {ChannelConfigInput} channel
 * @param {Pick<ChannelConfigContext, "channelOrder"|"optionalChannels"|"channelSpecs">} context
 * @param {string} [analysisName]
 * @returns {ReturnType<typeof buildChannelAnalysis>}
 */
export function validateChannel(name, channel, context, analysisName = name) {
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

    const analysis = buildChannelAnalysis(analysisName, channel);
    const { scaleDef, outputComponents } = analysis;
    const allowsTypeOverride =
        ((scaleDef.allowsU32InputOverride === true &&
            spec?.type === "f32" &&
            channel.type === "u32") ||
            (scaleDef.allowsF32InputOverride === true &&
                spec?.type === "u32" &&
                channel.type === "f32")) &&
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
        !optionalChannels.includes(name) &&
        !isSeriesChannelConfig(channel) &&
        !isValueChannelConfig(channel)
    ) {
        throw new Error(`Channel "${name}" must specify either data or value.`);
    }
    if (isSeriesChannelConfig(channel) && !channel.type) {
        throw new Error(`Channel "${name}" requires a series data type.`);
    }
    if (
        optionalChannels.includes(name) &&
        !isSeriesChannelConfig(channel) &&
        !isValueChannelConfig(channel)
    ) {
        return analysis;
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

    if (
        channel.conditions !== undefined &&
        !Array.isArray(channel.conditions)
    ) {
        throw new Error(`Channel "${name}" conditions must be an array.`);
    }
    if (Array.isArray(channel.conditions)) {
        for (const condition of channel.conditions) {
            if (!condition || typeof condition !== "object") {
                throw new Error(
                    `Channel "${name}" has an invalid condition entry.`
                );
            }
            if (!condition.when || typeof condition.when !== "object") {
                throw new Error(
                    `Channel "${name}" conditions require a "when" predicate.`
                );
            }
            const { when, value } = condition;
            if (
                typeof when.selection !== "string" ||
                when.selection.length < 1
            ) {
                throw new Error(
                    `Channel "${name}" conditions require a selection name.`
                );
            }
            if (
                when.type !== "single" &&
                when.type !== "multi" &&
                when.type !== "interval"
            ) {
                throw new Error(
                    `Channel "${name}" has invalid selection type "${when.type}".`
                );
            }
            if (Object.hasOwn(when, "channel")) {
                throw new Error(
                    `Selection "${when.selection}" uses the obsolete "channel" form; specify targets.`
                );
            }
            if (Object.hasOwn(when, "secondaryChannel")) {
                throw new Error(
                    `Selection "${when.selection}" uses the obsolete "secondaryChannel" form; specify secondaryInput.`
                );
            }
            if (when.type === "interval") {
                if (!Array.isArray(when.targets) || when.targets.length === 0) {
                    throw new Error(
                        `Interval selection "${when.selection}" must specify a non-empty targets array.`
                    );
                }
                const names = new Set();
                for (const target of when.targets) {
                    if (!target || typeof target !== "object") {
                        throw new Error(
                            `Interval selection "${when.selection}" has an invalid target.`
                        );
                    }
                    if (
                        typeof target.input !== "string" ||
                        target.input.length === 0
                    ) {
                        throw new Error(
                            `Interval selection "${when.selection}" targets require an input name.`
                        );
                    }
                    if (names.has(target.input)) {
                        throw new Error(
                            `Interval selection "${when.selection}" cannot target "${target.input}" more than once.`
                        );
                    }
                    names.add(target.input);
                    if (
                        target.secondaryInput !== undefined &&
                        (typeof target.secondaryInput !== "string" ||
                            target.secondaryInput.length === 0)
                    ) {
                        throw new Error(
                            `Interval selection "${when.selection}" has an invalid secondary input.`
                        );
                    }
                    if (
                        target.hitTest !== undefined &&
                        target.hitTest !== "intersects" &&
                        target.hitTest !== "encloses" &&
                        target.hitTest !== "endpoints"
                    ) {
                        throw new Error(
                            `Interval selection "${when.selection}" has invalid hit-test mode "${target.hitTest}".`
                        );
                    }
                    if (
                        target.hitTest !== undefined &&
                        target.secondaryInput === undefined
                    ) {
                        throw new Error(
                            `Interval selection "${when.selection}" cannot specify a hit-test mode without a secondary input.`
                        );
                    }
                    if (
                        target.input !== undefined &&
                        !channelOrder.includes(target.input)
                    ) {
                        throw new Error(
                            `Channel "${name}" references unknown selection input "${target.input}".`
                        );
                    }
                    if (
                        target.secondaryInput !== undefined &&
                        !channelOrder.includes(target.secondaryInput)
                    ) {
                        throw new Error(
                            `Channel "${name}" references unknown selection input "${target.secondaryInput}".`
                        );
                    }
                }
            } else if (Object.hasOwn(when, "targets")) {
                throw new Error(
                    `Selection "${when.selection}" may only specify targets for interval selections.`
                );
            }
            if (when.empty !== undefined && typeof when.empty !== "boolean") {
                throw new Error(
                    `Selection "${when.selection}" empty flag must be boolean.`
                );
            }
            if (condition.channel) {
                if (value !== undefined) {
                    throw new Error(
                        `Channel "${name}" conditions must not specify both channel and value.`
                    );
                }
                const conditional = /** @type {ChannelConfigInput} */ (
                    condition.channel
                );
                if (!conditional || typeof conditional !== "object") {
                    throw new Error(
                        `Channel "${name}" conditions must include a channel config.`
                    );
                }
                if (
                    "conditions" in conditional &&
                    conditional.conditions !== undefined
                ) {
                    throw new Error(
                        `Channel "${name}" conditions must not nest other conditions.`
                    );
                }
                if (
                    "default" in conditional &&
                    conditional.default !== undefined
                ) {
                    throw new Error(
                        `Channel "${name}" conditions must not include defaults.`
                    );
                }
                if (
                    !isSeriesChannelConfig(conditional) &&
                    !isValueChannelConfig(conditional)
                ) {
                    throw new Error(
                        `Channel "${name}" conditions must supply data or value.`
                    );
                }
                if (isSeriesChannelConfig(conditional) && !conditional.type) {
                    throw new Error(
                        `Channel "${name}" conditions require a series data type.`
                    );
                }
                continue;
            }
            if (value === undefined) {
                throw new Error(
                    `Channel "${name}" conditions require a value.`
                );
            }
            if (analysis.outputComponents === 1) {
                if (typeof value !== "number") {
                    throw new Error(
                        `Channel "${name}" conditions require scalar values.`
                    );
                }
            } else if (
                !Array.isArray(value) ||
                value.length !== analysis.outputComponents
            ) {
                throw new Error(
                    `Channel "${name}" conditions require ${analysis.outputComponents}-component values.`
                );
            }
        }
    }
    return analysis;
}
