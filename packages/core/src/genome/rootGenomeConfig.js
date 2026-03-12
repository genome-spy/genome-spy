import { getContigs } from "./genomes.js";

/**
 * @typedef {import("../spec/root.js").RootConfig} RootConfig
 * @typedef {import("../spec/root.js").NamedGenomeConfig} NamedGenomeDefinition
 */

/**
 * @typedef {object} ResolvedRootGenomeConfig
 * @prop {Map<string, NamedGenomeDefinition>} genomesByName
 * @prop {string | undefined} defaultAssembly
 * @prop {string | undefined} deprecationWarning
 */

/**
 * Resolves root-level genome configuration into a canonical map and default
 * assembly name.
 *
 * @param {RootConfig} rootConfig
 * @returns {ResolvedRootGenomeConfig}
 */
export function resolveRootGenomeConfig(rootConfig) {
    if (rootConfig.genome && rootConfig.genomes) {
        throw new Error(
            "Do not mix deprecated `genome` with `genomes`. Use only `genomes` and `assembly`."
        );
    }

    if (rootConfig.genome && rootConfig.assembly) {
        throw new Error(
            "Do not mix deprecated `genome` with root `assembly`. Use `genomes` and `assembly`."
        );
    }

    if (rootConfig.genome) {
        const { name, ...config } = rootConfig.genome;
        const hasDefinition = Object.keys(config).length > 0;
        return {
            genomesByName:
                !hasDefinition && isBuiltInAssembly(name)
                    ? new Map()
                    : new Map([[name, config]]),
            defaultAssembly: name,
            deprecationWarning: getLegacyGenomeWarning(),
        };
    }

    /** @type {Map<string, NamedGenomeDefinition>} */
    const genomesByName = new Map();
    for (const [name, config] of Object.entries(rootConfig.genomes ?? {})) {
        genomesByName.set(name, config ?? {});
    }

    let defaultAssembly = rootConfig.assembly;
    if (!defaultAssembly && genomesByName.size === 1) {
        defaultAssembly = genomesByName.keys().next().value;
    }

    if (
        defaultAssembly &&
        !genomesByName.has(defaultAssembly) &&
        !isBuiltInAssembly(defaultAssembly)
    ) {
        throw new Error(
            `Root assembly "${defaultAssembly}" is neither defined in \`genomes\` nor a built-in assembly.`
        );
    }

    return {
        genomesByName,
        defaultAssembly,
        deprecationWarning: undefined,
    };
}

/**
 * @returns {string}
 */
function getLegacyGenomeWarning() {
    return (
        "Root `genome` is deprecated and will be removed in a future version. " +
        "Use root `genomes` and `assembly` instead. Built-in migration example: " +
        '{"genome":{"name":"hg38"}} -> {"assembly":"hg38"}.'
    );
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isBuiltInAssembly(name) {
    try {
        getContigs(name);
        return true;
    } catch (_error) {
        return false;
    }
}
