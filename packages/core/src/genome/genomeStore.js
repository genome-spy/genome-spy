import Genome from "./genome.js";

export default class GenomeStore {
    /**
     * @param {string} baseUrl
     */
    constructor(baseUrl) {
        /** @type {Map<string, Genome>} */
        this.genomes = new Map();

        /** @type {Map<string, Omit<import("../spec/genome.js").GenomeConfig, "name">>} */
        this.#configuredGenomesByName = new Map();

        /** @type {Map<string, Promise<void>>} */
        this.#loadingPromisesByName = new Map();

        /** @type {Map<string, string>} */
        this.#inlineAssemblyKeysByName = new Map();

        /** @type {string | undefined} */
        this.#defaultAssemblyName = undefined;

        this.baseUrl = baseUrl;
    }

    /** @type {Map<string, Omit<import("../spec/genome.js").GenomeConfig, "name">>} */
    #configuredGenomesByName;

    /** @type {Map<string, Promise<void>>} */
    #loadingPromisesByName;

    /** @type {Map<string, string>} */
    #inlineAssemblyKeysByName;

    /** @type {string | undefined} */
    #defaultAssemblyName;

    /**
     * @param {import("../spec/genome.js").GenomeConfig} genomeConfig
     */
    async initialize(genomeConfig) {
        const { name, ...config } = genomeConfig;
        this.configureGenomes(new Map([[name, config]]), name);
        await this.ensureAssembly(name);
    }

    /**
     * @param {Map<string, Omit<import("../spec/genome.js").GenomeConfig, "name">>} genomesByName
     * @param {string} [defaultAssembly]
     */
    configureGenomes(genomesByName, defaultAssembly) {
        this.genomes.clear();
        this.#loadingPromisesByName.clear();
        this.#inlineAssemblyKeysByName.clear();
        this.#configuredGenomesByName = new Map(genomesByName);
        this.#defaultAssemblyName = defaultAssembly;
    }

    /**
     * @returns {string | undefined}
     */
    getDefaultAssemblyName() {
        if (this.#defaultAssemblyName) {
            return this.#defaultAssemblyName;
        }

        if (this.#configuredGenomesByName.size === 1) {
            return this.#configuredGenomesByName.keys().next().value;
        }

        if (
            this.#configuredGenomesByName.size === 0 &&
            this.genomes.size === 1
        ) {
            return this.genomes.keys().next().value;
        }

        return undefined;
    }

    /**
     * @param {(string | import("../spec/scale.js").InlineLocusAssembly | undefined)[]} assemblies
     */
    async ensureAssemblies(assemblies) {
        /** @type {Promise<Genome>[]} */
        const pending = [];
        /** @type {Set<string>} */
        const seenStringAssemblies = new Set();
        /** @type {Set<string>} */
        const seenInlineAssemblies = new Set();

        for (const assembly of assemblies) {
            if (!assembly) {
                continue;
            }

            if (typeof assembly === "object") {
                const key = JSON.stringify(assembly);
                if (seenInlineAssemblies.has(key)) {
                    continue;
                }
                seenInlineAssemblies.add(key);
                pending.push(this.ensureAssembly(assembly));
                continue;
            }

            if (seenStringAssemblies.has(assembly)) {
                continue;
            }
            seenStringAssemblies.add(assembly);
            pending.push(this.ensureAssembly(assembly));
        }

        await Promise.all(pending);
    }

    /**
     * @param {string | import("../spec/scale.js").InlineLocusAssembly} assembly
     * @returns {Promise<Genome>}
     */
    async ensureAssembly(assembly) {
        if (typeof assembly === "object") {
            return this.#getInlineAssemblyGenome(assembly);
        }

        const existing = this.genomes.get(assembly);
        if (existing) {
            return existing;
        }

        const configured = this.#configuredGenomesByName.get(assembly);
        if (configured) {
            return this.#ensureConfiguredGenome(assembly, configured);
        }

        const builtIn = this.#tryCreateBuiltInGenome(assembly);
        if (builtIn) {
            this.genomes.set(assembly, builtIn);
            return builtIn;
        }

        throw new Error(
            `No genome with the name ${assembly} has been configured!`
        );
    }

    /**
     * @param {string | import("../spec/scale.js").InlineLocusAssembly} [name] If not given, a default genome is returned.
     * @returns {Genome}
     */
    getGenome(name) {
        if (name && typeof name == "object") {
            return this.#getInlineAssemblyGenome(name);
        }

        if (typeof name === "string") {
            const genome = this.genomes.get(name);
            if (genome) {
                return genome;
            }

            if (this.#configuredGenomesByName.has(name)) {
                throw new Error(
                    `Genome ${name} has not been loaded yet. Call ensureAssembly("${name}") before accessing it.`
                );
            }

            const builtIn = this.#tryCreateBuiltInGenome(name);
            if (builtIn) {
                this.genomes.set(name, builtIn);
                return builtIn;
            }

            throw new Error(
                `No genome with the name ${name} has been configured!`
            );
        }

        const defaultAssemblyName = this.getDefaultAssemblyName();
        if (defaultAssemblyName) {
            return this.getGenome(defaultAssemblyName);
        }

        if (this.genomes.size === 0 && this.#configuredGenomesByName.size) {
            throw new Error(
                "Cannot pick a default genome because configured genomes have not been loaded. Define `assembly` in the root spec or call ensureAssembly() before requesting the default genome."
            );
        }

        if (this.genomes.size > 1) {
            throw new Error(
                "Cannot pick a default genome! More than one have been configured!"
            );
        }

        if (this.genomes.size === 0) {
            throw new Error("No genomes have been configured!");
        }

        return this.genomes.values().next().value;
    }

    /**
     * @param {string} name
     * @returns {Genome | undefined}
     */
    #tryCreateBuiltInGenome(name) {
        try {
            return new Genome({ name });
        } catch (_error) {
            return undefined;
        }
    }

    /**
     * @param {string} name
     * @param {Omit<import("../spec/genome.js").GenomeConfig, "name">} config
     * @returns {Promise<Genome>}
     */
    async #ensureConfiguredGenome(name, config) {
        const existing = this.genomes.get(name);
        if (existing) {
            return existing;
        }

        const pending = this.#loadingPromisesByName.get(name);
        if (pending) {
            await pending;
            const loaded = this.genomes.get(name);
            if (!loaded) {
                throw new Error(
                    `Loading genome ${name} failed before it became available.`
                );
            }
            return loaded;
        }

        const genome = new Genome({
            name,
            ...config,
        });
        this.genomes.set(name, genome);

        const loadPromise = genome.load(this.baseUrl);
        this.#loadingPromisesByName.set(name, loadPromise);

        try {
            await loadPromise;
        } catch (error) {
            this.genomes.delete(name);
            throw error;
        } finally {
            this.#loadingPromisesByName.delete(name);
        }

        return genome;
    }

    /**
     * @param {import("../spec/scale.js").InlineLocusAssembly} assembly
     * @returns {Genome}
     */
    #getInlineAssemblyGenome(assembly) {
        if ("name" in assembly) {
            throw new Error(
                "Inline `scale.assembly` objects must be anonymous. Use a string reference for named assemblies."
            );
        }

        if (!("contigs" in assembly)) {
            throw new Error(
                "Inline `scale.assembly` objects must define `contigs`."
            );
        }

        const key = JSON.stringify(assembly);
        const inlineName = this.#getInlineAssemblyName(key);
        const existing = this.genomes.get(inlineName);
        if (existing) {
            return existing;
        }

        const genome = new Genome({
            name: inlineName,
            contigs: assembly.contigs,
        });
        this.genomes.set(inlineName, genome);

        return genome;
    }

    /**
     * @param {string} key
     * @returns {string}
     */
    #getInlineAssemblyName(key) {
        const hash = hashString(key);
        for (let suffix = 0; suffix <= Number.MAX_SAFE_INTEGER; suffix++) {
            const candidate =
                suffix === 0
                    ? `inline_assembly_${hash}`
                    : `inline_assembly_${hash}_${suffix}`;
            const existingKey = this.#inlineAssemblyKeysByName.get(candidate);
            if (existingKey === key) {
                return candidate;
            }
            if (!existingKey) {
                this.#inlineAssemblyKeysByName.set(candidate, key);
                return candidate;
            }
        }

        throw new Error("Could not generate a unique inline assembly name!");
    }
}

/**
 * @param {string} value
 * @returns {string}
 */
function hashString(value) {
    let hash = 5381;
    for (let i = 0; i < value.length; i++) {
        // eslint-disable-next-line no-bitwise
        hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
    }
    // eslint-disable-next-line no-bitwise
    return (hash >>> 0).toString(36);
}
