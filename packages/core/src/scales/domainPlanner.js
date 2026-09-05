import { INDEX, LOCUS } from "./scaleResolutionConstants.js";
import {
    toInternalIndexLikeDataDomain,
    toInternalIndexLikeInterval,
} from "./indexLikeDomainUtils.js";
import { hasIntervalSelectionBindingInScope } from "./selectionDomainUtils.js";
import createDomain from "../utils/domainArray.js";
import { resolveConfiguredDomainValue } from "./domainExpressions.js";
import { getAccessorDomainKey, isScaleAccessor } from "../encoder/accessor.js";
import { isViewportDomainRef } from "./viewportDomain.js";
import { getEncoderAccessors, getPrimaryChannel } from "../encoder/encoder.js";
import {
    hasExplicitLocusUpperBound,
    isChromosomalLocusInterval,
} from "../genome/genome.js";

/*
 * Domain planning decides what domain a shared scale should use before the
 * scale instance is configured.
 *
 * "Planning" means collecting the participating members, separating literal
 * configured domains from selection-driven domains, validating that the shared
 * scale is not asked to mix incompatible sources, and producing the final union
 * that will be applied to the scale.
 */

/**
 * @typedef {import("../utils/domainArray.js").DomainArray} DomainArray
 * @typedef {import("../spec/scale.js").ComplexDomain} ComplexDomain
 * @typedef {import("../spec/scale.js").ScalarDomain} ScalarDomain
 * @typedef {import("../spec/scale.js").SelectionDomainRef} SelectionDomainRef
 * @typedef {import("../spec/parameter.js").ExprRef} ExprRef
 * @typedef {import("./scaleResolution.js").ScaleResolutionMember} ScaleResolutionMember
 * @typedef {{ channel: import("../spec/channel.js").ChannelWithScale, type: import("../spec/channel.js").Type, domain: import("../spec/scale.js").Scale["domain"] }} ConfiguredDomainSource
 * @typedef {(paramName: string, encoding: "x" | "y") => { runtime: any, selection: import("../types/selectionTypes.js").IntervalSelection | undefined }} SelectionBindingResolver
 * @typedef {(member: ScaleResolutionMember) => import("../data/viewportDomain.js").ViewportConstraint[]} ViewportConstraintsGetter
 * @typedef {(interval: ScalarDomain | ComplexDomain) => number[]} FromComplexInterval
 * @typedef {(assembly: import("../spec/scale.js").Scale["assembly"] | undefined) => number[]} GetLocusExtent
 * @typedef {{
 *   domains: DomainArray[],
 *   selectionRef: SelectionDomainLinkInfo | undefined,
 *   selectionRuntime: any,
 *   selectionDescription: string | undefined,
 *   hasLiteralDomain: boolean,
 * }} ConfiguredDomainResolutionState
 * @typedef {{
 *   kind: "literal",
 *   domain: DomainArray,
 * } | {
 *   kind: "selection",
 *   domain: DomainArray | undefined,
 *   description: string,
 *   param: string,
 *   encoding: "x" | "y",
 *   hasInitial: boolean,
 *   runtime: any,
 * }} ConfiguredDomainMemberResolution
 * @typedef {{
 *   param: string,
 *   encoding: "x" | "y",
 *   hasInitial: boolean,
 *   runtime: any,
 * }} SelectionDomainLinkInfo
 */

/**
 * @param {Set<ScaleResolutionMember>} members
 * @param {ConfiguredDomainSource | undefined} viewLevelDomain
 * @param {(expr: string) => import("../paramRuntime/types.js").ExprRefFunction} createExpression
 * @param {SelectionBindingResolver} resolveSelectionBinding
 * @param {(interval: ScalarDomain | ComplexDomain) => number[]} fromComplexInterval
 * @param {boolean} includeSelectionInitial
 * @returns {{
 *   domain: DomainArray | undefined,
 *   selectionRef: SelectionDomainLinkInfo | undefined,
 * }}
 */
export function resolveConfiguredDomain(
    members,
    viewLevelDomain,
    createExpression,
    resolveSelectionBinding,
    fromComplexInterval,
    includeSelectionInitial
) {
    const domainMembers = Array.from(members)
        .filter((member) => member.contributesToDomain)
        .filter((member) => {
            const domain = member.channelDef.scale?.domain;
            return domain && !isViewportDomainRef(domain);
        });

    /** @type {ConfiguredDomainResolutionState} */
    const state = {
        domains: [],
        selectionRef: undefined,
        selectionRuntime: undefined,
        selectionDescription: undefined,
        hasLiteralDomain: false,
    };

    if (
        viewLevelDomain?.domain !== undefined &&
        !isViewportDomainRef(viewLevelDomain.domain)
    ) {
        const resolved = resolveConfiguredDomainSource(
            viewLevelDomain,
            createExpression,
            resolveSelectionBinding,
            fromComplexInterval,
            includeSelectionInitial
        );
        mergeConfiguredDomainResolution(state, resolved);
    }

    for (const member of domainMembers) {
        const resolved = resolveConfiguredDomainSource(
            {
                channel: member.channel,
                type: member.channelDef.type,
                domain: member.channelDef.scale.domain,
            },
            createExpression,
            resolveSelectionBinding,
            fromComplexInterval,
            includeSelectionInitial
        );

        mergeConfiguredDomainResolution(state, resolved);
    }

    return finishConfiguredDomainResolution(state);
}

/**
 * Resolve link metadata without evaluating ordinary expressions or converting
 * locus coordinates before assemblies and scale dependencies are initialized.
 * @param {Set<ScaleResolutionMember>} members
 * @param {ConfiguredDomainSource | undefined} viewLevelDomain
 * @param {SelectionBindingResolver} resolveBinding
 * @returns {SelectionDomainLinkInfo | undefined}
 */
export function resolveSelectionDomainInfo(
    members,
    viewLevelDomain,
    resolveBinding
) {
    const sources = Array.from(members)
        .filter((member) => member.contributesToDomain)
        .map((member) => ({
            channel: member.channel,
            domain: member.channelDef.scale?.domain,
        }));
    if (viewLevelDomain) sources.push(viewLevelDomain);
    let literal = false;
    /** @type {SelectionDomainLinkInfo | undefined} */
    let link;
    for (const { channel, domain } of sources) {
        if (domain === undefined || isViewportDomainRef(domain)) continue;
        if (!isSelectionDomainRef(domain)) {
            literal = true;
            continue;
        }
        const encoding = resolveSelectionDomainChannel(
            channel,
            domain,
            domain.param
        );
        const { runtime } = resolveBinding(domain.param, encoding);
        if (
            link &&
            (link.runtime !== runtime ||
                link.param !== domain.param ||
                link.encoding !== encoding)
        ) {
            throw new Error(
                "Conflicting selection domain references on a shared scale: " +
                    link.param +
                    "." +
                    link.encoding +
                    " vs " +
                    domain.param +
                    "." +
                    encoding +
                    "."
            );
        }
        link = {
            runtime,
            param: domain.param,
            encoding,
            hasInitial:
                (link?.hasInitial ?? false) || domain.initial !== undefined,
        };
    }
    if (link && literal)
        throw new Error(
            "Cannot mix selection-driven and literal configured domains on a shared scale."
        );
    return link;
}

/**
 * @param {ConfiguredDomainResolutionState} state
 * @param {ConfiguredDomainMemberResolution} resolved
 */
function mergeConfiguredDomainResolution(state, resolved) {
    if (resolved.kind === "selection") {
        mergeSelectionConfiguredDomain(state, resolved);
    } else {
        mergeLiteralConfiguredDomain(state, resolved);
    }
}

/**
 * @param {ConfiguredDomainSource} source
 * @param {(expr: string) => import("../paramRuntime/types.js").ExprRefFunction} createExpression
 * @param {SelectionBindingResolver} resolveSelectionBinding
 * @param {(interval: ScalarDomain | ComplexDomain) => number[]} fromComplexInterval
 * @param {boolean} includeSelectionInitial
 * @returns {ConfiguredDomainMemberResolution}
 */
function resolveConfiguredDomainSource(
    source,
    createExpression,
    resolveSelectionBinding,
    fromComplexInterval,
    includeSelectionInitial
) {
    const domainDef = source.domain;
    if (isSelectionDomainRef(domainDef)) {
        return {
            kind: "selection",
            ...resolveSelectionDomain(
                source,
                domainDef,
                resolveSelectionBinding,
                fromComplexInterval,
                includeSelectionInitial
            ),
        };
    }

    return {
        kind: "literal",
        domain: resolveConfiguredIntervalDomain(
            source.type,
            resolveConfiguredDomainValue(domainDef, createExpression),
            fromComplexInterval
        ),
    };
}

/**
 * @param {ConfiguredDomainResolutionState} state
 * @param {Extract<ConfiguredDomainMemberResolution, { kind: "selection" }>} resolved
 */
function mergeSelectionConfiguredDomain(state, resolved) {
    if (state.hasLiteralDomain) {
        throw new Error(
            "Cannot mix selection-driven and literal configured domains on a shared scale."
        );
    }

    if (
        state.selectionRef &&
        (state.selectionRef.runtime !== resolved.runtime ||
            state.selectionRef.param !== resolved.param ||
            state.selectionRef.encoding !== resolved.encoding)
    ) {
        throw new Error(
            "Conflicting selection domain references on a shared scale: " +
                state.selectionDescription +
                " vs " +
                resolved.description +
                "."
        );
    }

    state.selectionRuntime = resolved.runtime;
    state.selectionDescription = resolved.description;
    state.selectionRef = {
        param: resolved.param,
        encoding: resolved.encoding,
        hasInitial:
            (state.selectionRef?.hasInitial ?? false) || resolved.hasInitial,
        runtime: resolved.runtime,
    };

    if (resolved.domain) {
        state.domains.push(resolved.domain);
    }
}

/**
 * @param {ConfiguredDomainResolutionState} state
 * @param {Extract<ConfiguredDomainMemberResolution, { kind: "literal" }>} resolved
 */
function mergeLiteralConfiguredDomain(state, resolved) {
    if (state.selectionRuntime) {
        throw new Error(
            "Cannot mix literal configured domains with selection-driven domains on a shared scale."
        );
    }

    state.hasLiteralDomain = true;
    state.domains.push(resolved.domain);
}

/**
 * @param {ConfiguredDomainResolutionState} state
 * @returns {{
 *   domain: DomainArray | undefined,
 *   selectionRef: SelectionDomainLinkInfo | undefined,
 * }}
 */
function finishConfiguredDomainResolution(state) {
    if (state.domains.length > 0) {
        return {
            domain: state.domains.reduce((acc, curr) => acc.extendAll(curr)),
            selectionRef: state.selectionRef,
        };
    }

    if (state.selectionRuntime) {
        // Selection refs are still the source of truth even when the
        // selection interval currently resolves to no domain.
        return { domain: undefined, selectionRef: state.selectionRef };
    }

    return { domain: undefined, selectionRef: undefined };
}

/**
 * @param {ConfiguredDomainSource} source
 * @param {SelectionDomainRef} domainRef
 * @param {SelectionBindingResolver} resolveSelectionBinding
 * @param {(interval: ScalarDomain | ComplexDomain) => number[]} fromComplexInterval
 * @param {boolean} includeSelectionInitial
 * @returns {{
 *   domain: DomainArray | undefined,
 *   description: string,
 *   param: string,
 *   encoding: "x" | "y",
 *   hasInitial: boolean,
 *   runtime: any,
 * }}
 */
function resolveSelectionDomain(
    source,
    domainRef,
    resolveSelectionBinding,
    fromComplexInterval,
    includeSelectionInitial
) {
    const paramName = domainRef.param;

    const resolvedChannel = resolveSelectionDomainChannel(
        source.channel,
        domainRef,
        paramName
    );

    const binding = resolveSelectionBinding(paramName, resolvedChannel);
    const hasInitial = domainRef.initial !== undefined;
    const interval = binding.selection?.intervals[resolvedChannel];
    const description = paramName + "." + resolvedChannel;
    if (!interval || interval.length !== 2) {
        const initialDomain = includeSelectionInitial
            ? domainRef.initial
                ? resolveConfiguredIntervalDomain(
                      source.type,
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
            hasInitial,
            runtime: binding.runtime,
        };
    }

    return {
        // Selection intervals already use internal scale-domain coordinates.
        domain: createDomain(source.type, fromComplexInterval(interval)),
        description,
        param: paramName,
        encoding: resolvedChannel,
        hasInitial,
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
    // TODO: support Vega-Lite-style `unionWith` domains.
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
export function validateSharedSelectionDomain(members, selectionRef) {
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
export function resolveDataDomain(members, getType, getAccessorsForMember) {
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
export function resolveDefaultDomain(
    type,
    getLocusExtent,
    dataDomain,
    locusAssembly
) {
    if (type == LOCUS) {
        return getLocusExtent(locusAssembly);
    }
    if (type == INDEX) {
        return dataDomain?.length
            ? toInternalIndexLikeDataDomain(type, dataDomain)
            : [];
    }
    return dataDomain ?? [];
}

/**
 * @param {ScaleResolutionMember} member
 * @returns {import("../types/encoder.js").ScaleAccessor[]}
 */
export function getScaleMemberAccessors(member) {
    const encoder = member.view.mark.encoders?.[member.channel];
    return encoder ? getEncoderAccessors(encoder).filter(isScaleAccessor) : [];
}
