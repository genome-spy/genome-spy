import { span } from "vega-util";
import { isContinuous } from "vega-scale";

import { LOCUS } from "./scaleResolutionConstants.js";
import createDomain from "../utils/domainArray.js";

/**
 * @typedef {import("../utils/domainArray.js").DomainArray} DomainArray
 * @typedef {import("../spec/scale.js").ComplexDomain} ComplexDomain
 * @typedef {import("../spec/scale.js").ScalarDomain} ScalarDomain
 * @typedef {import("./scaleResolution.js").ScaleResolutionMember} ScaleResolutionMember
 */

export default class ScaleDomainAggregator {
    /** @type {Set<ScaleResolutionMember>} */
    #members;

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
        this.#members = getMembers();
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
            (this.#getType() == LOCUS
                ? this.#getLocusExtent()
                : extractDataDomain
                  ? this.getDataDomain()
                  : [])
        );
    }

    /**
     * Unions the configured domains of all participating views.
     *
     * @return {DomainArray}
     */
    getConfiguredDomain() {
        const domains = Array.from(this.#members)
            .map((member) => member.channelDef)
            .filter((channelDef) => channelDef.scale?.domain)
            .map((channelDef) =>
                // TODO: Handle ExprRefs and Param in domain
                createDomain(
                    channelDef.type,
                    // Chrom/pos must be linearized first
                    this.#fromComplexInterval(channelDef.scale.domain)
                )
            );

        if (domains.length > 0) {
            return domains.reduce((acc, curr) => acc.extendAll(curr));
        }
    }

    /**
     * Extracts and unions the data domains of all participating views.
     *
     * @return {DomainArray}
     */
    getDataDomain() {
        return Array.from(this.#members)
            .map((member) =>
                member.dataDomainSource?.(member.channel, this.#getType())
            )
            .filter((domain) => !!domain)
            .reduce((acc, curr) => acc.extendAll(curr));
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
