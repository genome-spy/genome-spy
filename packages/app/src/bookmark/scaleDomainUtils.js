/**
 * @param {import("@genome-spy/core/types/scaleResolutionApi.js").ScaleResolutionApi} scaleResolution
 * @returns {boolean}
 */
export function shouldSerializeScaleDomain(scaleResolution) {
    const linkedDomainInfo = scaleResolution.getLinkedSelectionDomainInfo?.();
    return !linkedDomainInfo?.persist;
}

/**
 * @param {{ getNamedScaleResolutions: () => Map<string, import("@genome-spy/core/types/scaleResolutionApi.js").ScaleResolutionApi> }} genomeSpy
 * @param {(scaleResolution: import("@genome-spy/core/types/scaleResolutionApi.js").ScaleResolutionApi) => boolean} predicate
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
