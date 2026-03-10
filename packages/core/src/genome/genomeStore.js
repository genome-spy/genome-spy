import Genome from "./genome.js";

export default class GenomeStore {
    /**
     * @param {string} baseUrl
     */
    constructor(baseUrl) {
        /** @type {Map<string, Genome>} */
        this.genomes = new Map();

        /** @type {Map<string, string>} */
        this.#inlineAssemblyKeysByName = new Map();
        this.baseUrl = baseUrl;
    }

    /** @type {Map<string, string>} */
    #inlineAssemblyKeysByName;

    /**
     * @param {import("../spec/genome.js").GenomeConfig} genomeConfig
     */
    // eslint-disable-next-line require-await
    async initialize(genomeConfig) {
        const genome = new Genome(genomeConfig);
        this.genomes.set(genome.name, genome);

        return Promise.all(
            [...this.genomes.values()].map((genome) =>
                genome.load(this.baseUrl)
            )
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

        if (!this.genomes.size) {
            if (!name) {
                throw new Error("No genomes have been configured!");
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

        if (name) {
            const genome = this.genomes.get(name);
            if (genome) {
                return genome;
            }

            const builtIn = this.#tryCreateBuiltInGenome(name);
            if (builtIn) {
                this.genomes.set(name, builtIn);
                return builtIn;
            }

            throw new Error(
                `No genome with the name ${name} has been configured!`
            );
        } else {
            if (this.genomes.size > 1) {
                throw new Error(
                    "Cannot pick a default genome! More than one have been configured!"
                );
            }
            return this.genomes.values().next().value;
        }
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
