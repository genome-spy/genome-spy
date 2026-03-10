/**
 * @typedef {import("../spec/scale.js").Scale["assembly"]} AssemblyReference
 */

/**
 * @typedef {object} AssemblyPreflightResult
 * @prop {AssemblyReference[]} assemblies
 * @prop {boolean} needsDefaultAssembly
 */

/**
 * @param {import("../spec/view.js").ViewSpec | import("../spec/view.js").ImportSpec} spec
 * @returns {AssemblyPreflightResult}
 */
export function collectAssembliesFromSpec(spec) {
    /** @type {AssemblyReference[]} */
    const assemblies = [];
    let needsDefaultAssembly = false;

    /**
     * @param {unknown} node
     */
    const visit = (node) => {
        if (!node || typeof node !== "object") {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        const value = /** @type {Record<string, unknown>} */ (node);

        const encoding = value.encoding;
        if (isObject(encoding)) {
            for (const channelDef of Object.values(encoding)) {
                if (!isObject(channelDef) || Array.isArray(channelDef)) {
                    continue;
                }

                const scale = isObject(channelDef.scale)
                    ? channelDef.scale
                    : undefined;
                const isLocus =
                    channelDef.type === "locus" || scale?.type === "locus";

                if (!isLocus) {
                    continue;
                }

                if (scale && "assembly" in scale && scale.assembly) {
                    assemblies.push(
                        /** @type {AssemblyReference} */ (scale.assembly)
                    );
                } else {
                    needsDefaultAssembly = true;
                }
            }
        }

        const templates = value.templates;
        if (isObject(templates)) {
            for (const template of Object.values(templates)) {
                visit(template);
            }
        }

        for (const key of [
            "layer",
            "hconcat",
            "vconcat",
            "concat",
            "multiscale",
        ]) {
            const children = value[key];
            if (Array.isArray(children)) {
                for (const child of children) {
                    visit(child);
                }
            }
        }
    };

    visit(spec);

    return {
        assemblies,
        needsDefaultAssembly,
    };
}

/**
 * Ensures that all assemblies required by the spec are loaded before the view
 * hierarchy is created.
 *
 * @param {import("../spec/view.js").ViewSpec | import("../spec/view.js").ImportSpec} spec
 * @param {import("./genomeStore.js").default} genomeStore
 */
export async function ensureAssembliesForSpec(spec, genomeStore) {
    const { assemblies, needsDefaultAssembly } =
        collectAssembliesFromSpec(spec);
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
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isObject(value) {
    return !!value && typeof value === "object";
}
