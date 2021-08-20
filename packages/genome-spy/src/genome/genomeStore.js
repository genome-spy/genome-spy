import Genome from "./genome";

export default class GenomeStore {
    /**
     * @param {import("../genomeSpy").default} genomeSpy
     */
    constructor(genomeSpy) {
        /** @type {Map<string, Genome>} */
        this.genomes = new Map();
        this.genomeSpy = genomeSpy;
    }

    /**
     * @param {import("../spec/genome").GenomeConfig} genomeConfig
     */
    // eslint-disable-next-line require-await
    async initialize(genomeConfig) {
        const genome = new Genome(genomeConfig);
        this.genomes.set(genome.name, genome);

        return Promise.all(
            [...this.genomes.values()].map(genome =>
                genome.load(this.genomeSpy.spec.baseUrl)
            )
        );
    }

    /**
     * @param {string} [name] If not given, a default genome is returned.
     * @returns {Genome}
     */
    getGenome(name) {
        if (!this.genomes.size) {
            throw new Error("No genomes have been configured!");
        }

        if (name) {
            const genome = this.genomes.get(name);
            if (!genome) {
                throw new Error(
                    `No genome with the name ${name} has been configured!`
                );
            }
            return genome;
        } else {
            if (this.genomes.size > 1) {
                throw new Error(
                    "Cannot pick a default genome! More than one have been configured!"
                );
            }
            return this.genomes.values().next().value;
        }
    }
}
