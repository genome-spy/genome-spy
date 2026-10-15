import { getAccessorDomainKey, isScaleAccessor } from "../encoder/accessor.js";
import {
    getEncoderAccessors,
    getEncoderDataAccessor,
    primaryPositionalChannels,
} from "../encoder/encoder.js";
import createDomain from "../utils/domainArray.js";
import { isSubtreeLazyReady } from "../view/dataReadiness.js";
import { isContinuous, isDiscrete } from "vega-scale";
import { NOMINAL, ORDINAL } from "./scaleResolutionConstants.js";

const AUTOSCALE_DEBOUNCE = 150;

/**
 * @typedef {import("../spec/scale.js").ViewportDomainRef} ViewportDomainRef
 * @typedef {import("./scaleResolution.js").ScaleResolutionMember} ScaleResolutionMember
 * @typedef {{ channel: import("../spec/channel.js").ChannelWithScale, type: import("../spec/channel.js").Type, domain: import("../spec/scale.js").Scale["domain"] }} ConfiguredDomainSource
 * @typedef {(member: ScaleResolutionMember) => import("../data/viewportDomain.js").ViewportConstraint[]} ViewportConstraintsGetter
 */

/**
 * @param {any} domain
 * @returns {domain is ViewportDomainRef}
 */
export function isViewportDomainRef(domain) {
    return (
        typeof domain === "object" &&
        domain !== null &&
        !Array.isArray(domain) &&
        domain.source === "viewport"
    );
}

/**
 * Validates viewport-domain sources across all members, including currently
 * inactive members that may become active later.
 *
 * @param {Set<ScaleResolutionMember>} members
 * @param {ConfiguredDomainSource | undefined} viewLevelDomain
 * @returns {ViewportDomainRef["mode"]}
 */
export function validateSharedViewportDomain(members, viewLevelDomain) {
    /** @type {ConfiguredDomainSource[]} */
    const sources = [];

    if (viewLevelDomain?.domain !== undefined) {
        sources.push(viewLevelDomain);
    }

    for (const member of members) {
        const domain = member.channelDef.scale?.domain;
        if (member.contributesToDomain && domain !== undefined) {
            sources.push({
                channel: member.channel,
                type: member.channelDef.type,
                domain,
            });
        }
    }

    const visibleSources = sources.filter((source) =>
        isViewportDomainRef(source.domain)
    );
    /** @type {Set<NonNullable<ViewportDomainRef["mode"]>>} */
    const modes = new Set();
    for (const source of visibleSources) {
        if (source.type === NOMINAL || source.type === ORDINAL) {
            throw new Error(
                `Viewport-derived domains require a continuous scale, but channel "${source.channel}" has type "${source.type}".`
            );
        }

        const domain = /** @type {ViewportDomainRef} */ (source.domain);
        const mode = domain.mode ?? "intersect";
        if (mode !== "intersect" && mode !== "contain") {
            throw new Error(`Unknown viewport domain mode: ${mode}.`);
        }
        modes.add(mode);
    }

    if (visibleSources.length > 0 && visibleSources.length !== sources.length) {
        throw new Error(
            "Cannot mix viewport-derived and other configured domains on a shared scale."
        );
    }

    if (modes.size > 1) {
        throw new Error("Cannot mix viewport domain modes on a shared scale.");
    }

    return modes.values().next().value;
}

/**
 * @param {Set<ScaleResolutionMember>} members
 * @param {() => import("../spec/channel.js").Type} getType
 * @param {(member: ScaleResolutionMember) => import("../types/encoder.js").ScaleAccessor[]} getAccessorsForMember
 * @param {ViewportConstraintsGetter} getViewportConstraints
 * @returns {import("../utils/domainArray.js").DomainArray | undefined}
 */
export function resolveVisibleDataDomain(
    members,
    getType,
    getAccessorsForMember,
    getViewportConstraints
) {
    const type = getType();
    const domain = createDomain(type);
    let hasContributors = false;

    for (const member of members) {
        if (!member.contributesToDomain) {
            continue;
        }

        const accessors = getAccessorsForMember(member);
        if (accessors.length === 0) {
            continue;
        }

        const constraints = getViewportConstraints(member);
        const collector = member.view.getCollector();
        for (const accessor of accessors) {
            if (collector) {
                domain.extendAll(
                    collector.getViewportDomain(
                        getAccessorDomainKey(accessor, type),
                        type,
                        accessor,
                        constraints
                    )
                );
                hasContributors = true;
            } else if (accessor.constant) {
                domain.extend(accessor({}));
                hasContributors = true;
            }
        }
    }

    return hasContributors ? domain : undefined;
}

/**
 * @param {ScaleResolutionMember} member
 * @param {import("./scaleResolution.js").default} targetResolution
 * @param {import("../spec/channel.js").ChannelWithScale} targetChannel
 * @param {(resolution: import("./scaleResolution.js").default) => boolean} hasDependencyPath
 * @param {ViewportDomainRef["mode"]} mode
 * @returns {import("../data/viewportDomain.js").ViewportConstraint[]}
 */
export function getViewportConstraints(
    member,
    targetResolution,
    targetChannel,
    hasDependencyPath,
    mode
) {
    /** @type {import("../data/viewportDomain.js").ViewportConstraint[]} */
    const constraints = [];

    for (const channel of primaryPositionalChannels) {
        const resolution = member.view.getScaleResolution(channel);
        if (!resolution || resolution === targetResolution) {
            continue;
        }
        if (hasDependencyPath(resolution)) {
            throw new Error(
                `Viewport-derived scale domains form a dependency cycle in view "${member.view.getPathString()}".`
            );
        }

        const scale = resolution.getScale();
        if (!isContinuous(scale.type) || isDiscrete(scale.type)) {
            continue;
        }

        const encoder = member.view.mark.encoders?.[channel];
        if (!encoder) {
            continue;
        }
        const accessor = getViewportAccessor(encoder);
        if (!accessor) {
            continue;
        }

        const secondaryChannel = channel === "x" ? "x2" : "y2";
        const secondaryEncoder = member.view.mark.encoders?.[secondaryChannel];
        const accessor2 = secondaryEncoder
            ? getViewportAccessor(secondaryEncoder)
            : undefined;
        const domain = resolution.getDomain();
        constraints.push({
            channel,
            domain: [domain[0], domain.at(-1)],
            accessor,
            ...(accessor2 && { accessor2 }),
            mode,
        });
    }

    if (constraints.length === 0) {
        const viewPath =
            member.view.getPathString?.() ?? member.view.name ?? "(unknown)";
        throw new Error(
            `Viewport-derived ${targetChannel} domain in view "${viewPath}" requires an independent continuous positional scale.`
        );
    }

    return constraints;
}

/**
 * @param {Set<ScaleResolutionMember>} members
 * @param {import("./scaleResolution.js").default} targetResolution
 */
export function getViewportDependencies(members, targetResolution) {
    /** @type {Set<import("./scaleResolution.js").default>} */
    const dependencies = new Set();
    for (const member of members) {
        for (const channel of primaryPositionalChannels) {
            const resolution = member.view.getScaleResolution(channel);
            if (resolution && resolution !== targetResolution) {
                dependencies.add(resolution);
            }
        }
    }
    return dependencies;
}

/**
 * @param {Set<ScaleResolutionMember>} members
 * @param {(member: ScaleResolutionMember) => import("../data/viewportDomain.js").ViewportConstraint[]} getConstraints
 */
export function isViewportDataReady(members, getConstraints) {
    for (const member of members) {
        const collector = member.view.getCollector();
        if (!collector?.completed) {
            return false;
        }

        /** @type {import("../data/sources/lazy/singleAxisLazySource.js").DataReadinessRequest} */
        const request = {};
        for (const constraint of getConstraints(member)) {
            request[constraint.channel] = Array.from(constraint.domain);
        }
        if (
            !isSubtreeLazyReady(
                member.view,
                request,
                (view) => view === member.view
            )
        ) {
            return false;
        }
    }
    return true;
}

export class ViewportDomainScheduler {
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    #timer;

    #waitingForData = false;

    /**
     * @param {object} options
     * @param {() => boolean} options.isReady
     * @param {() => void} options.update
     */
    constructor({ isReady, update }) {
        this.isReady = isReady;
        this.update = update;
    }

    /** @param {boolean} collectorChanged */
    schedule(collectorChanged) {
        if (collectorChanged && this.#waitingForData && this.isReady()) {
            this.#waitingForData = false;
            this.update();
            return;
        }

        clearTimeout(this.#timer);
        this.#waitingForData = false;
        this.#timer = setTimeout(() => {
            this.#timer = undefined;
            if (this.isReady()) {
                this.update();
            } else {
                this.#waitingForData = true;
            }
        }, AUTOSCALE_DEBOUNCE);
    }

    clear() {
        clearTimeout(this.#timer);
        this.#timer = undefined;
        this.#waitingForData = false;
    }
}

/**
 * @param {import("../types/encoder.js").Encoder} encoder
 * @returns {import("../types/encoder.js").Accessor | undefined}
 */
function getViewportAccessor(encoder) {
    return (
        getEncoderDataAccessor(encoder) ??
        getEncoderAccessors(encoder).find(isScaleAccessor)
    );
}
