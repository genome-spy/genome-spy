import { visitAddressableViews } from "../view/viewSelectors.js";

/**
 * @typedef {import("../spec/scale.js").Scale["assembly"]} AssemblyReference
 */

/**
 * @typedef {object} AssemblyPreflightResult
 * @prop {AssemblyReference[]} assemblies
 * @prop {boolean} needsDefaultAssembly
 */

/**
 * @param {import("../view/view.js").default} viewRoot
 * @returns {AssemblyPreflightResult}
 */
export function collectAssembliesFromViewHierarchy(viewRoot) {
    /** @type {AssemblyReference[]} */
    const assemblies = [];
    let needsDefaultAssembly = false;

    const resolutions = collectRelevantScaleResolutions(viewRoot);
    for (const resolution of resolutions) {
        const requirement = resolution.getAssemblyRequirement();
        if (requirement.assembly) {
            assemblies.push(requirement.assembly);
        }
        if (requirement.needsDefaultAssembly) {
            needsDefaultAssembly = true;
        }
    }

    return {
        assemblies,
        needsDefaultAssembly,
    };
}

/**
 * Ensures that all assemblies required by the given view hierarchy are loaded
 * before any scale initialization path can run.
 *
 * Reminder: call this immediately after view hierarchy creation and before
 * operations that can implicitly initialize scales (for example, step-based
 * size resolution, dynamic opacity setup, or encoder initialization).
 *
 * @param {import("../view/view.js").default} viewRoot
 * @param {import("./genomeStore.js").default} genomeStore
 */
export async function ensureAssembliesForView(viewRoot, genomeStore) {
    const { assemblies, needsDefaultAssembly } =
        collectAssembliesFromViewHierarchy(viewRoot);
    if (needsDefaultAssembly) {
        const defaultAssembly = genomeStore.getDefaultAssemblyName();
        if (!defaultAssembly) {
            throw new Error(
                "No default assembly has been configured. Set root `assembly`, define exactly one entry in root `genomes`, or set `scale.assembly` on each locus scale."
            );
        }
        assemblies.push(defaultAssembly);
    }

    await genomeStore.ensureAssemblies(assemblies);
}

/**
 * Collects scale resolutions that can influence user-authored views while
 * excluding internal helper subtrees (axis/grid/etc.).
 *
 * Reminder: implicit root wrappers are marked non-addressable, so include the
 * root ancestry explicitly before traversing addressable views.
 *
 * @param {import("../view/view.js").default} viewRoot
 * @returns {Set<import("../scales/scaleResolution.js").default>}
 */
function collectRelevantScaleResolutions(viewRoot) {
    /** @type {Set<import("../view/view.js").default>} */
    const relevantViews = new Set([viewRoot]);
    visitAddressableViews(viewRoot, (view) => {
        relevantViews.add(view);
    });

    /** @type {Set<import("../scales/scaleResolution.js").default>} */
    const resolutions = new Set();

    /** @type {import("../spec/channel.js").PrimaryPositionalChannel[]} */
    const locusChannels = ["x", "y"];

    for (const view of relevantViews) {
        for (const channel of locusChannels) {
            const resolution = view.getScaleResolution(channel);
            if (resolution) {
                resolutions.add(resolution);
            }
        }
    }

    return resolutions;
}
