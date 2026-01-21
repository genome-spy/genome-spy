import { span } from "vega-util";
import { isContinuous } from "vega-scale";

import { LOCUS } from "./scaleResolutionConstants.js";
import createDomain from "../utils/domainArray.js";
import { getAccessorDomainKey, isScaleAccessor } from "../encoder/accessor.js";

/**
 * @typedef {import("../utils/domainArray.js").DomainArray} DomainArray
 * @typedef {import("../spec/scale.js").ComplexDomain} ComplexDomain
 * @typedef {import("../spec/scale.js").ScalarDomain} ScalarDomain
 * @typedef {import("./scaleResolution.js").ScaleResolutionMember} ScaleResolutionMember
 */

export default class ScaleDomainAggregator {
    /** @type {() => Set<ScaleResolutionMember>} */
    #getMembers;

    /** @type {() => import("../spec/channel.js").Type} */
    #getType;

    /** @type {() => number[]} */
    #getLocusExtent;

    /** @type {(interval: ScalarDomain | ComplexDomain) => number[]} */
    #fromComplexInterval;

    /** @type {any[]} */
    #initialDomain;

    /**
     * @param {object} options
     * @param {() => Set<ScaleResolutionMember>} options.getMembers
     * @param {() => import("../spec/channel.js").Type} options.getType
     * @param {() => number[]} options.getLocusExtent
     * @param {(interval: ScalarDomain | ComplexDomain) => number[]} options.fromComplexInterval
     */
    constructor({ getMembers, getType, getLocusExtent, fromComplexInterval }) {
        this.#getMembers = getMembers;
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

    hasConfiguredDomain() {
        return !!this.getConfiguredDomain();
    }

    /**
     * Returns the configured domain or a data-derived/default domain.
     *
     * @param {boolean} [extractDataDomain]
     * @returns {any[]}
     */
    getConfiguredOrDefaultDomain(extractDataDomain = false) {
        // TODO: intersect the domain with zoom extent (if it's defined)
        return (
            this.getConfiguredDomain() ??
            resolveDefaultDomain(
                this.#getType(),
                this.#getLocusExtent,
                extractDataDomain ? this.getDataDomain() : undefined
            )
        );
    }

    /**
     * Unions the configured domains of all participating views.
     *
     * @return {DomainArray}
     */
    getConfiguredDomain() {
        return resolveConfiguredDomain(
            this.#getMembers(),
            this.#fromComplexInterval
        );
    }

    /**
     * Extracts and unions the data domains of all participating views.
     *
     * @return {DomainArray | undefined}
     */
    getDataDomain() {
        return resolveDataDomain(this.#getMembers(), this.#getType);
    }

    /**
     * @param {import("../types/encoder.js").VegaScale} scale
     * @param {boolean} domainWasInitialized
     * @returns {boolean} true if listeners should be notified immediately
     */
    captureInitialDomain(scale, domainWasInitialized) {
        if (!this.#initialDomain && isContinuous(scale.type)) {
            const domain = scale.domain();
            if (span(domain) > 0) {
                this.#initialDomain = domain;
            }
        }

        if (!domainWasInitialized) {
            this.#initialDomain = scale.domain();
            return true;
        }

        return false;
    }
}

/**
 * @param {Set<ScaleResolutionMember>} members
 * @param {(interval: ScalarDomain | ComplexDomain) => number[]} fromComplexInterval
 * @returns {DomainArray | undefined}
 */
function resolveConfiguredDomain(members, fromComplexInterval) {
    const domains = Array.from(members)
        .filter((member) => member.contributesToDomain)
        .map((member) => member.channelDef)
        .filter((channelDef) => channelDef.scale?.domain)
        .map((channelDef) =>
            // TODO: Handle ExprRefs and Param in domain
            createDomain(
                channelDef.type,
                // Chrom/pos must be linearized first
                fromComplexInterval(channelDef.scale.domain)
            )
        );

    if (domains.length > 0) {
        return domains.reduce((acc, curr) => acc.extendAll(curr));
    }
}

/**
 * @param {Set<ScaleResolutionMember>} members
 * @param {() => import("../spec/channel.js").Type} getType
 * @returns {DomainArray | undefined}
 */
function resolveDataDomain(members, getType) {
    const type = getType();

    /** @type {Map<import("../data/collector.js").default | null, Map<string, DomainArray>>} */
    const domainsByCollector = new Map();

    for (const member of members) {
        if (!member.contributesToDomain) {
            continue;
        }

        const encoders = member.view.mark.encoders;
        if (!encoders) {
            continue;
        }

        const encoder = encoders[member.channel];
        if (!encoder) {
            continue;
        }

        const accessors = encoder.accessors ?? [];
        if (accessors.length === 0) {
            continue;
        }

        const collector = member.view.getCollector();

        for (const accessor of accessors) {
            if (!isScaleAccessor(accessor)) {
                continue;
            }
            if (accessor.channelDef.contributesToScaleDomain === false) {
                continue;
            }

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
 * @param {() => number[]} getLocusExtent
 * @param {DomainArray | undefined} dataDomain
 * @returns {any[]}
 */
function resolveDefaultDomain(type, getLocusExtent, dataDomain) {
    if (type == LOCUS) {
        return getLocusExtent();
    }
    return dataDomain ?? [];
}
