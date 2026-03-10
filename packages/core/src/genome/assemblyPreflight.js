import {
    isChannelDefWithScale,
    isValueDefWithCondition,
} from "../encoder/encoder.js";
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

    // Only inspect user-addressable views. Internal helper views (axes, grid
    // decorations, scrollbars, etc.) may carry inherited locus encodings that
    // do not represent user-authored assembly requirements.
    visitAddressableViews(viewRoot, (view) => {
        const encoding = view.getEncoding();
        for (const channelDef of Object.values(encoding)) {
            if (!channelDef || Array.isArray(channelDef)) {
                continue;
            }

            /** @type {import("../spec/channel.js").ChannelDefWithScale | undefined} */
            let channelDefWithScale;
            if (isChannelDefWithScale(channelDef)) {
                channelDefWithScale = channelDef;
            } else if (isValueDefWithCondition(channelDef)) {
                const condition = channelDef.condition;
                if (
                    !Array.isArray(condition) &&
                    isChannelDefWithScale(condition)
                ) {
                    channelDefWithScale = condition;
                }
            }

            if (!channelDefWithScale) {
                continue;
            }

            const scale = channelDefWithScale.scale;
            const isLocus =
                channelDefWithScale.type === "locus" || scale?.type === "locus";

            if (!isLocus) {
                continue;
            }

            if (scale?.assembly) {
                assemblies.push(scale.assembly);
            } else {
                needsDefaultAssembly = true;
            }
        }
    });

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
