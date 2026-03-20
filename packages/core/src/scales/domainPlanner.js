import { span } from "vega-util";
import { isContinuous } from "vega-scale";

import { INDEX, LOCUS } from "./scaleResolutionConstants.js";
import {
    toInternalIndexLikeDataDomain,
    toInternalIndexLikeInterval,
} from "./indexLikeDomainUtils.js";
import {
    hasIntervalSelectionBindingInScope,
    resolveIntervalSelectionBinding,
} from "./selectionDomainUtils.js";
import createDomain from "../utils/domainArray.js";
import { getAccessorDomainKey, isScaleAccessor } from "../encoder/accessor.js";
import { getEncoderAccessors, getPrimaryChannel } from "../encoder/encoder.js";
import {
    hasExplicitLocusUpperBound,
    isChromosomalLocusInterval,
} from "../genome/genome.js";

/**
 * @typedef {import("../utils/domainArray.js").DomainArray} DomainArray
 * @typedef {import("../spec/scale.js").ComplexDomain} ComplexDomain
 * @typedef {import("../spec/scale.js").ScalarDomain} ScalarDomain
 * @typedef {import("../spec/scale.js").SelectionDomainRef} SelectionDomainRef
 * @typedef {import("./scaleResolution.js").ScaleResolutionMember} ScaleResolutionMember
 * @typedef {{
 *   param: string,
 *   encoding: "x" | "y",
 *   sync: "auto" | "oneWay" | "twoWay",
 *   runtime: any,
 * }} SelectionDomainLinkInfo
 */

export default class DomainPlanner {
    /** @type {() => Set<ScaleResolutionMember>} */
    #getMembers;

    /** @type {() => Set<ScaleResolutionMember>} */
    #getAllMembers;

    /** @type {() => Set<ScaleResolutionMember>} */
    #getDataMembers;

    /** @type {() => import("../spec/channel.js").Type} */
    #getType;

    /** @type {(assembly: import("../spec/scale.js").Scale["assembly"] | undefined) => number[]} */
    #getLocusExtent;

    /** @type {(interval: ScalarDomain | ComplexDomain) => number[]} */
    #fromComplexInterval;

    /** @type {any[]} */
    #initialDomain;

    /** @type {SelectionDomainLinkInfo | undefined} */
    #selectionDomainLinkInfo = undefined;

    #configuredDomainDirty = true;

    /** @type {Map<boolean, DomainArray | undefined>} */
    #configuredDomainsByInitialMode = new Map();

    /** @type {WeakMap<ScaleResolutionMember, import("../types/encoder.js").ScaleAccessor[]>} */
    #accessorsByMember = new WeakMap();

    /**
     * @param {object} options
     * @param {() => Set<ScaleResolutionMember>} options.getMembers
     * @param {() => Set<ScaleResolutionMember>} [options.getAllMembers]
     * @param {() => Set<ScaleResolutionMember>} [options.getDataMembers]
     * @param {() => import("../spec/channel.js").Type} options.getType
     * @param {(assembly: import("../spec/scale.js").Scale["assembly"] | undefined) => number[]} options.getLocusExtent
     * @param {(interval: ScalarDomain | ComplexDomain) => number[]} options.fromComplexInterval
     */
    constructor({
        getMembers,
        getAllMembers,
        getDataMembers,
        getType,
        getLocusExtent,
        fromComplexInterval,
    }) {
        this.#getMembers = getMembers;
        this.#getAllMembers = getAllMembers ?? getMembers;
        this.#getDataMembers = getDataMembers ?? getMembers;
        this.#getType = getType;
        this.#getLocusExtent = getLocusExtent;
        this.#fromComplexInterval = fromComplexInterval;
    }

    /**
     * @returns {any[]}
     */
    get initialDomainSnapshot() {
        return this.#initialDomain;
    }

    /**
     * @param {{ includeSelectionInitial?: boolean }} [options]
     */
    hasConfiguredDomain(options = {}) {
        return !!this.getConfiguredDomain(options);
    }

    hasSelectionConfiguredDomain() {
        this.getSelectionConfiguredDomainBindingInfo();
        return !!this.#selectionDomainLinkInfo;
    }

    /**
     * @returns {SelectionDomainLinkInfo | undefined}
     */
    getSelectionConfiguredDomainBindingInfo() {
        if (this.#selectionDomainLinkInfo || !this.#configuredDomainDirty) {
            return this.#selectionDomainLinkInfo;
        }

        this.getConfiguredDomain();
        return this.#selectionDomainLinkInfo;
    }

    getSelectionConfiguredDomainInfo() {
        const bindingInfo = this.getSelectionConfiguredDomainBindingInfo();
        if (!bindingInfo) {
            return;
        }

        return {
            param: bindingInfo.param,
            encoding: bindingInfo.encoding,
            sync: bindingInfo.sync,
        };
    }

    invalidateConfiguredDomain() {
        this.#configuredDomainDirty = true;
        this.#selectionDomainLinkInfo = undefined;
        this.#configuredDomainsByInitialMode.clear();
    }

    /**
     * Returns the default domain without considering configured domains.
     *
     * @param {boolean} [extractDataDomain]
     * @param {import("../spec/scale.js").Scale["assembly"]} [locusAssembly]
     * @returns {any[]}
     */
    getDefaultDomain(extractDataDomain = false, locusAssembly) {
        return resolveDefaultDomain(
            this.#getType(),
            this.#getLocusExtent,
            extractDataDomain ? this.getDataDomain() : undefined,
            locusAssembly
        );
    }

    /**
     * Returns the configured domain or a data-derived/default domain.
     *
     * @param {boolean} [extractDataDomain]
     * @param {import("../spec/scale.js").Scale["assembly"]} [locusAssembly]
     * @param {{ includeSelectionInitial?: boolean }} [options]
     * @returns {any[]}
     */
    getConfiguredOrDefaultDomain(
        extractDataDomain = false,
        locusAssembly,
        options = {}
    ) {
        // TODO: intersect the domain with zoom extent (if it's defined)
        return (
            this.getConfiguredDomain(options) ??
            this.getDefaultDomain(extractDataDomain, locusAssembly)
        );
    }

    /**
     * Unions the configured domains of all participating views.
     *
     * @param {{ includeSelectionInitial?: boolean }} [options]
     * @return {DomainArray}
     */
    getConfiguredDomain(options = {}) {
        const includeSelectionInitial =
            options.includeSelectionInitial ?? true;

        if (
            !this.#configuredDomainDirty &&
            this.#configuredDomainsByInitialMode.has(includeSelectionInitial)
        ) {
            return this.#configuredDomainsByInitialMode.get(
                includeSelectionInitial
            );
        }

        const configuredDomain = resolveConfiguredDomain(
            this.#getMembers(),
            this.#fromComplexInterval,
            includeSelectionInitial
        );
        validateSharedSelectionDomain(
            this.#getAllMembers(),
            configuredDomain.selectionRef
        );
        this.#selectionDomainLinkInfo = configuredDomain.selectionRef;
        this.#configuredDomainsByInitialMode.set(
            includeSelectionInitial,
            configuredDomain.domain
        );
        this.#configuredDomainDirty = false;
        return configuredDomain.domain;
    }

    /**
     * Extracts and unions the data domains of all participating views.
     *
     * @return {DomainArray | undefined}
     */
    getDataDomain() {
        return resolveDataDomain(
            this.#getDataMembers(),
            this.#getType,
            (member) => this.#getMemberAccessors(member)
        );
    }

    /**
     * @param {import("../types/encoder.js").VegaScale} scale
     * @param {boolean} domainWasInitialized
     * @param {any[]} [snapshotDomain]
     * @returns {boolean} true if listeners should be notified immediately
     */
    captureInitialDomain(scale, domainWasInitialized, snapshotDomain) {
        if (!this.#initialDomain && isContinuous(scale.type)) {
            const domain = snapshotDomain ?? scale.domain();
            if (span(domain) > 0) {
                this.#initialDomain = domain;
            }
        }

        if (!domainWasInitialized) {
            this.#initialDomain = snapshotDomain ?? scale.domain();
            return true;
        }

        return false;
    }

    /**
     * @param {ScaleResolutionMember} member
     * @returns {import("../types/encoder.js").ScaleAccessor[]}
     */
    #getMemberAccessors(member) {
        const cached = this.#accessorsByMember.get(member);
        if (cached) {
            return cached;
        }

        const encoders = member.view.mark.encoders;
        if (!encoders) {
            return [];
        }

        const encoder = encoders[member.channel];
        if (!encoder) {
            return [];
        }

        const accessors = getEncoderAccessors(encoder);
        if (accessors.length === 0) {
            return [];
        }

        const scaleAccessors = accessors
            .filter(isScaleAccessor)
            .filter((accessor) => !accessor.channelDef.domainInert);

        this.#accessorsByMember.set(member, scaleAccessors);
        return scaleAccessors;
    }
}

/**
 * @param {Set<ScaleResolutionMember>} members
 * @param {(interval: ScalarDomain | ComplexDomain) => number[]} fromComplexInterval
 * @param {boolean} includeSelectionInitial
 * @returns {{
 *   domain: DomainArray | undefined,
 *   selectionRef: SelectionDomainLinkInfo | undefined,
 * }}
 */
function resolveConfiguredDomain(
    members,
    fromComplexInterval,
    includeSelectionInitial
) {
    const domainMembers = Array.from(members)
        .filter((member) => member.contributesToDomain)
        .filter((member) => member.channelDef.scale?.domain);

    /** @type {DomainArray[]} */
    const domains = [];

    /** @type {any} */
    let selectionRefRuntime = undefined;
    /** @type {string | undefined} */
    let selectionRefDescription = undefined;
    /** @type {"auto" | "oneWay" | "twoWay" | undefined} */
    let selectionRefSync = undefined;
    /** @type {SelectionDomainLinkInfo | undefined} */
    let selectionRef = undefined;
    let hasLiteralDomain = false;

    for (const member of domainMembers) {
        const domainDef = member.channelDef.scale.domain;
        if (isSelectionDomainRef(domainDef)) {
            if (hasLiteralDomain) {
                throw new Error(
                    "Cannot mix selection-driven and literal configured domains on a shared scale."
                );
            }

            const resolved = resolveSelectionDomain(
                member,
                domainDef,
                fromComplexInterval,
                includeSelectionInitial
            );

            if (
                selectionRef &&
                (selectionRef.runtime !== resolved.runtime ||
                    selectionRef.param !== resolved.param ||
                    selectionRef.encoding !== resolved.encoding)
            ) {
                throw new Error(
                    "Conflicting selection domain references on a shared scale: " +
                        selectionRefDescription +
                        " vs " +
                        resolved.description +
                        "."
                );
            }

            if (!selectionRefSync) {
                selectionRefSync = resolved.sync;
            } else if (selectionRefSync === "auto") {
                selectionRefSync = resolved.sync;
            } else if (resolved.sync !== "auto") {
                if (selectionRefSync !== resolved.sync) {
                    throw new Error(
                        "Conflicting selection domain sync modes on a shared scale: " +
                            selectionRefSync +
                            " vs " +
                            resolved.sync +
                            "."
                    );
                }
            }

            selectionRefRuntime = resolved.runtime;
            selectionRefDescription = resolved.description;
            selectionRef = {
                param: resolved.param,
                encoding: resolved.encoding,
                sync: selectionRefSync,
                runtime: resolved.runtime,
            };

            if (resolved.domain) {
                domains.push(resolved.domain);
            }
            continue;
        }

        if (selectionRefRuntime) {
            throw new Error(
                "Cannot mix literal configured domains with selection-driven domains on a shared scale."
            );
        }

        hasLiteralDomain = true;
        domains.push(
            resolveConfiguredIntervalDomain(
                member.channelDef.type,
                domainDef,
                fromComplexInterval
            )
        );
    }

    if (domains.length > 0) {
        return {
            domain: domains.reduce((acc, curr) => acc.extendAll(curr)),
            selectionRef,
        };
    }

    if (selectionRefRuntime) {
        // Selection refs are still the source of truth even when the
        // selection interval currently resolves to no domain.
        return { domain: undefined, selectionRef };
    }

    return { domain: undefined, selectionRef: undefined };
}

/**
 * @param {ScaleResolutionMember} member
 * @param {SelectionDomainRef} domainRef
 * @param {(interval: ScalarDomain | ComplexDomain) => number[]} fromComplexInterval
 * @param {boolean} includeSelectionInitial
 * @returns {{
 *   domain: DomainArray | undefined,
 *   description: string,
 *   param: string,
 *   encoding: "x" | "y",
 *   sync: "auto" | "oneWay" | "twoWay",
 *   runtime: any,
 * }}
 */
function resolveSelectionDomain(
    member,
    domainRef,
    fromComplexInterval,
    includeSelectionInitial
) {
    const paramName = domainRef.param;
    const syncMode = domainRef.sync ?? "auto";

    if (syncMode !== "auto" && syncMode !== "oneWay" && syncMode !== "twoWay") {
        throw new Error(
            `Invalid selection domain sync mode "${syncMode}" for parameter "${paramName}".`
        );
    }

    const resolvedChannel = resolveSelectionDomainChannel(
        member.channel,
        domainRef,
        paramName
    );

    const binding = resolveIntervalSelectionBinding(
        member.view,
        paramName,
        resolvedChannel
    );
    const interval = binding.selection.intervals[resolvedChannel];
    const description = paramName + "." + resolvedChannel;
    if (!interval || interval.length !== 2) {
        const initialDomain = includeSelectionInitial
            ? domainRef.initial
                ? resolveConfiguredIntervalDomain(
                      member.channelDef.type,
                      domainRef.initial,
                      fromComplexInterval
                  )
                : undefined
            : undefined;
        return {
            domain: initialDomain,
            description,
            param: paramName,
            encoding: resolvedChannel,
            sync: syncMode,
            runtime: binding.runtime,
        };
    }

    return {
        // Selection intervals already use internal scale-domain coordinates.
        domain: createDomain(
            member.channelDef.type,
            fromComplexInterval(interval)
        ),
        description,
        param: paramName,
        encoding: resolvedChannel,
        sync: syncMode,
        runtime: binding.runtime,
    };
}

/**
 * @param {import("../spec/channel.js").Type} type
 * @param {ScalarDomain | ComplexDomain} interval
 * @param {(interval: ScalarDomain | ComplexDomain) => number[]} fromComplexInterval
 * @returns {DomainArray}
 */
function resolveConfiguredIntervalDomain(type, interval, fromComplexInterval) {
    const numericDomain = fromComplexInterval(interval);
    const internalDomain =
        type === LOCUS &&
        isChromosomalLocusInterval(interval) &&
        !hasExplicitLocusUpperBound(interval)
            ? numericDomain
            : toInternalIndexLikeInterval(type, numericDomain);

    return createDomain(type, internalDomain);
}

/**
 * Fails fast when a selection-driven scale domain ends up sharing the same
 * scale resolution as the interval selection that drives it. This typically
 * happens when an overview/detail spec forgets to make the linked positional
 * scale independent.
 *
 * @param {Set<ScaleResolutionMember>} members
 * @param {SelectionDomainLinkInfo | undefined} selectionRef
 */
function validateSharedSelectionDomain(members, selectionRef) {
    if (
        !selectionRef ||
        members.size < 2 ||
        !Array.from(members).some((member) =>
            hasIntervalSelectionBindingInScope(
                member.view,
                selectionRef.runtime,
                selectionRef.param,
                selectionRef.encoding
            )
        )
    ) {
        return;
    }

    const viewPaths = Array.from(
        new Set(
            Array.from(members)
                .filter((member) => member.contributesToDomain)
                .map(
                    (member) =>
                        member.view.getPathString?.() ??
                        member.view.name ??
                        "(unknown)"
                )
        )
    );

    throw new Error(
        `Selection domain reference "${selectionRef.param}.${selectionRef.encoding}" cannot use a shared ${selectionRef.encoding} scale when the same interval selection is defined in that shared view group (${viewPaths.join(", ")}). ` +
            `This creates a feedback loop between brushing and the scale domain. ` +
            `Make the linked ${selectionRef.encoding} scale independent, for example with ` +
            `"resolve": { "scale": { "${selectionRef.encoding}": "independent" } } on the common ancestor.`
    );
}

/**
 * @param {import("../spec/channel.js").ChannelWithScale} channel
 * @param {SelectionDomainRef} domainRef
 * @param {string} paramName
 * @returns {"x" | "y"}
 */
function resolveSelectionDomainChannel(channel, domainRef, paramName) {
    if (domainRef.encoding) {
        return domainRef.encoding;
    }

    const primaryChannel = getPrimaryChannel(channel);
    if (primaryChannel === "x" || primaryChannel === "y") {
        return primaryChannel;
    }

    throw new Error(
        `Selection domain reference "${paramName}" on channel "${channel}" requires an explicit "encoding" ("x" or "y").`
    );
}

/**
 * @param {any} domain
 * @returns {domain is SelectionDomainRef}
 */
export function isSelectionDomainRef(domain) {
    return (
        typeof domain === "object" &&
        domain !== null &&
        !Array.isArray(domain) &&
        typeof domain.param === "string"
    );
}

/**
 * @param {Set<ScaleResolutionMember>} members
 * @param {() => import("../spec/channel.js").Type} getType
 * @param {(member: ScaleResolutionMember) => import("../types/encoder.js").ScaleAccessor[]} getAccessorsForMember
 * @returns {DomainArray | undefined}
 */
function resolveDataDomain(members, getType, getAccessorsForMember) {
    const type = getType();

    /** @type {Map<import("../data/collector.js").default | null, Map<string, DomainArray>>} */
    const domainsByCollector = new Map();

    for (const member of members) {
        if (!member.contributesToDomain) {
            continue;
        }

        const accessors = getAccessorsForMember(member);
        if (accessors.length === 0) {
            continue;
        }

        const collector = member.view.getCollector();

        for (const accessor of accessors) {
            const domainKey = getAccessorDomainKey(accessor, type);

            const collectorKey = collector ?? null;
            let domainsForCollector = domainsByCollector.get(collectorKey);
            if (!domainsForCollector) {
                domainsForCollector = new Map();
                domainsByCollector.set(collectorKey, domainsForCollector);
            }

            if (domainsForCollector.has(domainKey)) {
                continue;
            }

            let domain;
            if (collector) {
                domain = collector.getDomain(domainKey, type, accessor);
            } else if (accessor.constant) {
                domain = createDomain(type);
                domain.extend(accessor({}));
            } else {
                continue;
            }

            domainsForCollector.set(domainKey, domain);
        }
    }

    if (domainsByCollector.size === 0) {
        return undefined;
    }

    const domain = createDomain(type);
    for (const domainsForCollector of domainsByCollector.values()) {
        for (const memberDomain of domainsForCollector.values()) {
            domain.extendAll(memberDomain);
        }
    }

    return domain;
}

/**
 * @param {import("../spec/channel.js").Type} type
 * @param {(assembly: import("../spec/scale.js").Scale["assembly"] | undefined) => number[]} getLocusExtent
 * @param {DomainArray | undefined} dataDomain
 * @param {import("../spec/scale.js").Scale["assembly"] | undefined} locusAssembly
 * @returns {any[]}
 */
function resolveDefaultDomain(type, getLocusExtent, dataDomain, locusAssembly) {
    if (type == LOCUS) {
        return getLocusExtent(locusAssembly);
    }
    if (type == INDEX) {
        return toInternalIndexLikeDataDomain(type, dataDomain) ?? [];
    }
    return dataDomain ?? [];
}
