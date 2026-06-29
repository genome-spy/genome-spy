/**
 * @typedef {{
 *   getResolvedScaleType: () => string | undefined,
 *   getAssemblyRequirement?: () => {
 *     assembly: import("../spec/scale.js").Scale["assembly"] | undefined,
 *     needsDefaultAssembly: boolean
 *   }
 * }} RulerScaleResolution
 */

/**
 * Returns true when two scale resolutions can share a ruler value.
 *
 * @param {RulerScaleResolution} source
 * @param {RulerScaleResolution} candidate
 */
export function areRulerScaleResolutionsCompatible(source, candidate) {
    const sourceType = source.getResolvedScaleType();
    const candidateType = candidate.getResolvedScaleType();

    if (!sourceType || sourceType !== candidateType) {
        return false;
    }

    if (sourceType === "locus") {
        return (
            getAssemblyCompatibilityKey(source) ===
            getAssemblyCompatibilityKey(candidate)
        );
    }

    return true;
}

/**
 * @param {RulerScaleResolution} resolution
 */
function getAssemblyCompatibilityKey(resolution) {
    const requirement = resolution.getAssemblyRequirement?.();
    if (!requirement) {
        return "default";
    }

    if (requirement.needsDefaultAssembly) {
        return "default";
    }

    const assembly = requirement.assembly;
    return typeof assembly == "object" ? JSON.stringify(assembly) : assembly;
}
