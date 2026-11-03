/**
 * @param {import("@genome-spy/core/scales/scaleResolution.js").default} scaleResolution
 * @returns {boolean}
 */
export function shouldSerializeScaleDomain(scaleResolution) {
    const type = scaleResolution.getResolvedScaleType();
    if (type === "band" || type === "point") return false;
    const linkedDomainInfo = scaleResolution.getLinkedSelectionDomainInfo?.();
    return !linkedDomainInfo?.persist;
}

/**
 * @param {{ getNamedScaleResolutions: () => Map<string, import("@genome-spy/core/scales/scaleResolution.js").default> }} genomeSpy
 * @param {(scaleResolution: import("@genome-spy/core/scales/scaleResolution.js").default) => boolean} predicate
 * @returns {Record<string, any>}
 */
export function collectScaleDomains(genomeSpy, predicate) {
    /** @type {Record<string, any>} */
    const scaleDomains = {};

    for (const [name, scaleResolution] of genomeSpy
        .getNamedScaleResolutions()
        .entries()) {
        if (
            predicate(scaleResolution) &&
            shouldSerializeScaleDomain(scaleResolution)
        ) {
            scaleDomains[name] = scaleResolution.getComplexDomain();
        }
    }

    return scaleDomains;
}
