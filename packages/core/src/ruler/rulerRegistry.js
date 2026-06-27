import { isRulerParameter } from "../paramRuntime/paramUtils.js";
import { VISIT_SKIP } from "../view/view.js";
import { isChromeView } from "../view/viewSelectors.js";
import { areRulerScaleResolutionsCompatible } from "./rulerCompatibility.js";
import { resolveRulerExtent } from "./rulerExtent.js";

/**
 * @typedef {import("../spec/channel.js").PrimaryPositionalChannel} PrimaryPositionalChannel
 * @typedef {{
 *   owner: import("../view/view.js").default,
 *   paramName: string,
 *   config: import("../spec/parameter.js").RulerConfig,
 *   channels: PrimaryPositionalChannel[],
 *   extent: import("./rulerExtent.js").ResolvedRulerExtent,
 *   participants: RulerParticipant[]
 * }} RulerBinding
 * @typedef {{
 *   view: import("../view/view.js").default,
 *   channel: PrimaryPositionalChannel,
 *   scaleResolution: any
 * }} RulerParticipant
 */

/**
 * Resolves ruler bindings and their compatible participants.
 *
 * @param {import("../view/view.js").default} root
 * @returns {RulerBinding[]}
 */
export function resolveRulerBindings(root) {
    /** @type {RulerBinding[]} */
    const bindings = [];

    root.visit((view) => {
        for (const [paramName, param] of view.paramRuntime.paramConfigs) {
            if (isRulerParameter(param)) {
                const channels = param.ruler.encodings ?? ["x"];
                const participants = resolveParticipants(
                    view,
                    paramName,
                    channels
                );
                bindings.push({
                    owner: view,
                    paramName,
                    config: param.ruler,
                    channels,
                    extent: resolveRulerExtent({
                        paramName,
                        requestedExtent: param.ruler.extent,
                        owner: view,
                        channels,
                        participants,
                    }),
                    participants,
                });
            }
        }
    });

    validateNoParticipantOverlap(bindings);

    return bindings;
}

/**
 * @param {import("../view/view.js").default} owner
 * @param {string} paramName
 * @param {PrimaryPositionalChannel[]} channels
 * @returns {RulerParticipant[]}
 */
function resolveParticipants(owner, paramName, channels) {
    /** @type {RulerParticipant[]} */
    const participants = [];

    for (const channel of channels) {
        const candidates = collectChannelCandidates(owner, paramName, channel);
        const source = candidates[0]?.scaleResolution;
        if (!source) {
            continue;
        }

        for (const candidate of candidates) {
            if (
                areRulerScaleResolutionsCompatible(
                    source,
                    candidate.scaleResolution
                )
            ) {
                participants.push(candidate);
            }
        }
    }

    return participants;
}

/**
 * @param {import("../view/view.js").default} owner
 * @param {string} paramName
 * @param {PrimaryPositionalChannel} channel
 * @returns {RulerParticipant[]}
 */
function collectChannelCandidates(owner, paramName, channel) {
    /** @type {RulerParticipant[]} */
    const candidates = [];

    owner.visit((view) => {
        if (view !== owner && hasLocalRulerParam(view, paramName)) {
            return VISIT_SKIP;
        }

        if (isChromeView(view)) {
            return VISIT_SKIP;
        }

        const scaleResolution = view.getScaleResolution?.(channel);
        if (scaleResolution?.getResolvedScaleType?.()) {
            candidates.push({
                view,
                channel,
                scaleResolution,
            });
        }
    });

    return candidates;
}

/**
 * @param {import("../view/view.js").default} view
 * @param {string} paramName
 */
function hasLocalRulerParam(view, paramName) {
    const param = view.paramRuntime?.paramConfigs?.get(paramName);
    return param ? isRulerParameter(param) : false;
}

/**
 * @param {RulerBinding[]} bindings
 */
function validateNoParticipantOverlap(bindings) {
    /** @type {Map<import("../view/view.js").default, Map<PrimaryPositionalChannel, string[]>>} */
    const participantsByView = new Map();

    for (const binding of bindings) {
        for (const participant of binding.participants) {
            let channels = participantsByView.get(participant.view);
            if (!channels) {
                channels = new Map();
                participantsByView.set(participant.view, channels);
            }

            const names = channels.get(participant.channel) ?? [];
            names.push(binding.paramName);
            channels.set(participant.channel, names);

            if (names.length > 1) {
                throw new Error(
                    `Multiple ruler parameters would apply to view "${getViewName(
                        participant.view
                    )}" on channel "${participant.channel}": ${names.join(
                        ", "
                    )}.`
                );
            }
        }
    }
}

/**
 * @param {import("../view/view.js").default} view
 */
function getViewName(view) {
    return view.name ?? view.getPathString?.() ?? "<unnamed>";
}
