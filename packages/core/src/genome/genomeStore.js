import Genome from "./genome.js";

/**
 * Resolves genome assemblies for locus scales.
 *
 * Keeps configured genome definitions and loaded `Genome` instances, supports
 * named and inline assemblies, and deduplicates concurrent URL loads.
 *
 * `ensureAssembly(...)` is the async loading boundary. `getGenome(...)` is
 * synchronous and expects required URL-backed assemblies to be ensured first.
 *
 * The default assembly comes from root `assembly`, a single configured genome,
 * or a single already-loaded built-in genome.
 */
export default class GenomeStore {
    /**
     * @param {string} baseUrl
     */
    constructor(baseUrl) {
        /** @type {Map<string, Genome>} */
        this.genomes = new Map();

        this.#configuredGenomesByName = new Map();
        this.#loadingPromisesByName = new Map();
        this.#inlineAssemblyNamesByKey = new Map();
        this.#nextInlineAssemblyIndex = 0;
        this.#defaultAssemblyName = undefined;

        this.baseUrl = baseUrl;
    }

    /** @type {Map<string, import("../spec/root.js").NamedGenomeConfig>} */
    #configuredGenomesByName;

    /** @type {Map<string, Promise<void>>} */
    #loadingPromisesByName;

    /** @type {Map<string, string>} */
    #inlineAssemblyNamesByKey;

    /** @type {number} */
    #nextInlineAssemblyIndex;

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
     * @param {Map<string, import("../spec/root.js").NamedGenomeConfig>} genomesByName
     * @param {string} [defaultAssembly]
     */
    configureGenomes(genomesByName, defaultAssembly) {
        this.genomes.clear();
        this.#loadingPromisesByName.clear();
        this.#inlineAssemblyNamesByKey.clear();
        this.#nextInlineAssemblyIndex = 0;
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
        const seenAssemblies = new Set();

        for (const assembly of assemblies) {
            if (!assembly) {
                continue;
            }

            const dedupKey = getAssemblyDedupKey(assembly);
            if (seenAssemblies.has(dedupKey)) {
                continue;
            }

            seenAssemblies.add(dedupKey);
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
            return this.#ensureInlineAssemblyGenome(assembly);
        }

        const existing = this.genomes.get(assembly);
        if (existing) {
            return existing;
        }

        const configured = this.#configuredGenomesByName.get(assembly);
        if (configured) {
            return this.#ensureConfiguredGenome(assembly, configured);
        }

        const builtIn = this.#getOrCreateBuiltInGenome(assembly);
        if (builtIn) {
            return builtIn;
        }

        throw this.#createUnknownGenomeError(assembly);
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

            const builtIn = this.#getOrCreateBuiltInGenome(name);
            if (builtIn) {
                return builtIn;
            }

            throw this.#createUnknownGenomeError(name);
        }

        const defaultAssemblyName = this.getDefaultAssemblyName();
        if (defaultAssemblyName) {
            return this.getGenome(defaultAssemblyName);
        }

        if (this.#configuredGenomesByName.size > 1) {
            throw new Error(
                "Cannot pick a default genome! More than one have been configured!"
            );
        }

        if (this.genomes.size === 0 && this.#configuredGenomesByName.size) {
            throw new Error(
                "Default genome is not loaded. Define root `assembly` or call ensureAssembly() first."
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
        } catch {
            return undefined;
        }
    }

    /**
     * @param {string} name
     * @returns {Error}
     */
    #createUnknownGenomeError(name) {
        return new Error(
            `No genome with the name ${name} has been configured!`
        );
    }

    /**
     * @param {string} name
     * @returns {Genome | undefined}
     */
    #getOrCreateBuiltInGenome(name) {
        const builtIn = this.#tryCreateBuiltInGenome(name);
        if (builtIn) {
            this.genomes.set(name, builtIn);
            return builtIn;
        }

        return undefined;
    }

    /**
     * @param {string} name
     * @param {string} missingGenomeError
     * @returns {Promise<Genome>}
     */
    async #awaitLoadedGenomeFromPending(name, missingGenomeError) {
        const pending = this.#loadingPromisesByName.get(name);
        if (!pending) {
            throw new Error(`No pending genome load for ${name}.`);
        }

        await pending;
        const loaded = this.genomes.get(name);
        if (!loaded) {
            throw new Error(missingGenomeError);
        }

        return loaded;
    }

    /**
     * @param {string} name
     * @param {Genome} genome
     * @returns {Promise<Genome>}
     */
    async #loadGenome(name, genome) {
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
     * @param {string} name
     * @param {import("../spec/root.js").NamedGenomeConfig} config
     * @returns {Promise<Genome>}
     */
    async #ensureConfiguredGenome(name, config) {
        const existing = this.genomes.get(name);
        if (existing) {
            if (this.#loadingPromisesByName.has(name)) {
                return this.#awaitLoadedGenomeFromPending(
                    name,
                    `Loading genome ${name} failed before it became available.`
                );
            }
            return existing;
        }

        if (this.#loadingPromisesByName.has(name)) {
            return this.#awaitLoadedGenomeFromPending(
                name,
                `Loading genome ${name} failed before it became available.`
            );
        }

        const genome = new Genome({
            name,
            ...config,
        });
        this.genomes.set(name, genome);

        if ("url" in config) {
            return this.#loadGenome(name, genome);
        }

        return genome;
    }

    /**
     * @param {import("../spec/scale.js").InlineLocusAssembly} assembly
     * @returns {Promise<Genome>}
     */
    async #ensureInlineAssemblyGenome(assembly) {
        this.#validateInlineAssembly(assembly);

        const inlineName = this.#resolveInlineAssemblyName(assembly);

        const existing = this.genomes.get(inlineName);
        if (existing) {
            if (this.#loadingPromisesByName.has(inlineName)) {
                return this.#awaitLoadedGenomeFromPending(
                    inlineName,
                    `Loading inline assembly ${inlineName} failed before it became available.`
                );
            }
            return existing;
        }

        if (this.#loadingPromisesByName.has(inlineName)) {
            return this.#awaitLoadedGenomeFromPending(
                inlineName,
                `Loading inline assembly ${inlineName} failed before it became available.`
            );
        }

        if ("contigs" in assembly) {
            const genome = new Genome({
                name: inlineName,
                contigs: assembly.contigs,
            });
            this.genomes.set(inlineName, genome);
            return genome;
        }

        const genome = new Genome({
            name: inlineName,
            url: assembly.url,
        });
        this.genomes.set(inlineName, genome);

        return this.#loadGenome(inlineName, genome);
    }

    /**
     * @param {import("../spec/scale.js").InlineLocusAssembly} assembly
     * @returns {Genome}
     */
    #getInlineAssemblyGenome(assembly) {
        this.#validateInlineAssembly(assembly);

        const inlineName = this.#resolveInlineAssemblyName(assembly);
        const existing = this.genomes.get(inlineName);
        if (existing) {
            if (this.#loadingPromisesByName.has(inlineName)) {
                throw new Error(
                    `Inline URL assembly ${inlineName} has not been loaded yet. Call ensureAssembly() before accessing it.`
                );
            }
            return existing;
        }

        if ("url" in assembly) {
            throw new Error(
                "Inline URL assemblies must be loaded first. Call ensureAssembly() before accessing it."
            );
        }

        const genome = new Genome({
            name: inlineName,
            contigs: assembly.contigs,
        });
        this.genomes.set(inlineName, genome);

        return genome;
    }

    /**
     * @param {import("../spec/scale.js").InlineLocusAssembly} assembly
     */
    #validateInlineAssembly(assembly) {
        const hasContigs = "contigs" in assembly;
        const hasUrl = "url" in assembly;
        if (hasContigs === hasUrl) {
            throw new Error(
                "Inline `scale.assembly` objects must define exactly one of `contigs` or `url`."
            );
        }
    }

    /**
     * @param {import("../spec/scale.js").InlineLocusAssembly} assembly
     * @returns {string}
     */
    #resolveInlineAssemblyName(assembly) {
        const key = JSON.stringify(assembly);
        const existingName = this.#inlineAssemblyNamesByKey.get(key);
        if (existingName) {
            return existingName;
        }

        let candidate = `inline_assembly_${this.#nextInlineAssemblyIndex}`;
        this.#nextInlineAssemblyIndex += 1;
        while (
            this.genomes.has(candidate) ||
            this.#configuredGenomesByName.has(candidate) ||
            this.#loadingPromisesByName.has(candidate)
        ) {
            candidate = `inline_assembly_${this.#nextInlineAssemblyIndex}`;
            this.#nextInlineAssemblyIndex += 1;
        }

        this.#inlineAssemblyNamesByKey.set(key, candidate);
        return candidate;
    }
}

/**
 * @param {string | import("../spec/scale.js").InlineLocusAssembly} assembly
 * @returns {string}
 */
function getAssemblyDedupKey(assembly) {
    if (typeof assembly === "string") {
        return `name:${assembly}`;
    }

    return `inline:${JSON.stringify(assembly)}`;
}
