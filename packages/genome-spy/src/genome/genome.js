import { bisect } from "d3-array";
import { tsvParseRows } from "d3-dsv";
import { loader } from "vega-loader";
import createDomain from "../utils/domainArray";
import { formatRange } from "./locusFormat";

const defaultBaseUrl = "https://genomespy.app/data/genomes/";

/**
 * @typedef {import("../spec/genome").GenomeConfig} GenomeConfig
 *
 * @typedef {object} ChromosomalLocus
 * @prop {string} chromosome
 * @prop {number} pos Zero-based index
 *
 * @typedef {object} Chromosome
 * @prop {string} name
 * @prop {number} size
 *
 * @typedef {object} ChromosomeAnnotation
 * @prop {number} index 0-based index
 * @prop {number} number 1-based index
 * @prop {number} continuousStart zero-based start, inclusive
 * @prop {number} continuousEnd zero-based end, exclusive
 * @prop {number[]} continuousInterval
 * @prop {boolean} odd true if odd chrom number
 */

export default class Genome {
    /**
     * @param {GenomeConfig} config
     */
    constructor(config) {
        this.config = config;

        if (!this.config.contigs && typeof this.config.name !== "string") {
            throw new Error(
                "No name has been defined for the genome assembly!"
            );
        }

        /** @type {(Chromosome & ChromosomeAnnotation)[]} */
        this.chromosomes = [];

        /** @type {Map<string | number, number>} */
        this.cumulativeChromPositions = new Map();

        /** @type {Map<string | number, Chromosome & ChromosomeAnnotation>} */
        this.chromosomesByName = new Map();

        /** @type {number[]} */
        this.startByIndex = [];

        this.totalSize = 0;

        if (this.config.contigs) {
            this.setChromSizes(this.config.contigs);
        }
    }

    get name() {
        return this.config.name;
    }

    /**
     * @param {string} baseUrl
     */
    async load(baseUrl) {
        if (this.config.contigs) {
            return;
        }

        if (this.config.baseUrl) {
            this.baseUrl = /^http(s)?/.test(this.config.baseUrl)
                ? this.config.baseUrl
                : baseUrl + "/" + this.config.baseUrl;
        } else {
            this.baseUrl = defaultBaseUrl;
        }

        try {
            this.setChromSizes(
                parseChromSizes(
                    await loader({ baseURL: this.baseUrl }).load(
                        `${this.config.name}/${this.name}.chrom.sizes`
                    )
                )
            );
        } catch (e) {
            throw new Error(`Could not load chrom sizes: ${e.message}`);
        }
    }

    /**
     *
     * @param {Chromosome[]} chromSizes
     */
    setChromSizes(chromSizes) {
        let pos = 0;
        this.startByIndex = [0];

        for (let i = 0; i < chromSizes.length; i++) {
            this.startByIndex.push(pos);
            const size = chromSizes[i].size;

            const chrom = {
                ...chromSizes[i],
                continuousStart: pos,
                continuousEnd: pos + size,
                continuousInterval: [pos, pos + size],
                index: i,
                number: i + 1,
                // eslint-disable-next-line no-bitwise
                odd: !(i & 1)
            };

            this.chromosomes.push(chrom);

            const plain = chrom.name.replace(/^chr/i, "");
            for (const name of [
                "chr" + plain,
                "CHR" + plain,
                "Chr" + plain,
                chrom.number,
                "" + chrom.number,
                plain,
                chrom.name
            ]) {
                this.cumulativeChromPositions.set(name, pos);
                this.chromosomesByName.set(name, chrom);
            }

            pos += chrom.size;
        }

        this.totalSize = pos;
    }

    getExtent() {
        return [0, this.totalSize];
    }

    /**
     * Returns a chromosomal locus in the continuous domain
     *
     * @param {string | number} chrom A number or name with or without a "chr" prefix. Examples: 23, chrX, X
     * @param {number} pos zero-based coordinate
     */
    toContinuous(chrom, pos) {
        let offset = this.cumulativeChromPositions.get(chrom);
        if (offset === undefined) {
            throw new Error("Unknown chromosome/contig: " + chrom);
        }

        return offset + +pos;
    }

    /**
     *
     * @param {number} continuousPos
     */
    toChromosome(continuousPos) {
        if (continuousPos >= this.totalSize) {
            return; // TODO: Consider displaying a warning
        }

        continuousPos = Math.floor(continuousPos);

        // TODO: Fix the offset by one
        const i = bisect(this.startByIndex, continuousPos) - 1;
        if (i > 0 && i <= this.chromosomes.length) {
            return this.chromosomes[i - 1];
        }
    }

    /**
     *
     * @param {number} continuousPos
     * @returns {ChromosomalLocus}
     */
    toChromosomal(continuousPos) {
        const chrom = this.toChromosome(continuousPos);
        if (!chrom) {
            return undefined;
        }

        return {
            chromosome: chrom.name,
            pos: Math.floor(continuousPos) - chrom.continuousStart
        };
    }

    /**
     *
     * @param {string} name
     */
    getChromosome(name) {
        return this.chromosomesByName.get(name);
    }

    /**
     * Returns a UCSC Genome Browser -style string presentation of the interval.
     * However, the interval may span multiple chromosomes, which is incompatible
     * with UCSC.
     *
     * The inteval is shown as one-based closed-open range.
     * See https://genome.ucsc.edu/FAQ/FAQtracks#tracks1
     *
     * @param {number[]} interval
     * @returns {string}
     */
    formatInterval(interval) {
        return formatRange(...this.toChromosomalInterval(interval));
    }

    /**
     * @param {number[]} interval
     * @returns {[ChromosomalLocus, ChromosomalLocus]}
     */
    toChromosomalInterval(interval) {
        // Round the lower end
        const begin = this.toChromosomal(interval[0] + 0.5);
        // Because of the open upper bound, one is first subtracted from the upper bound and later added back.
        const end = this.toChromosomal(interval[1] - 1);
        end.pos += 1;

        return [begin, end];
    }

    /**
     *
     * @param {ChromosomalLocus[]} chromosomal
     */
    toContinuousInterval(chromosomal) {
        return chromosomal.map(c => this.toContinuous(c.chromosome, c.pos));
    }

    /**
     *
     * @param {string} str
     * @returns {[number, number]}
     */
    parseInterval(str) {
        // TODO: consider changing [0-9XY] to support other species besides humans
        const matches = str.match(
            /^(chr[0-9A-Z]+):([0-9,]+)-(?:(chr[0-9A-Z]+):)?([0-9,]+)$/
        );

        if (matches) {
            const startChr = matches[1];
            const endChr = matches[3] || startChr;

            const startIndex = parseInt(matches[2].replace(/,/g, ""));
            const endIndex = parseInt(matches[4].replace(/,/g, ""));

            return [
                this.toContinuous(startChr, startIndex - 1),
                this.toContinuous(endChr, endIndex)
            ];
        }
    }
}

/**
 *
 * @param {string} chromSizesData
 */
export function parseChromSizes(chromSizesData) {
    // TODO: Support other organisms too
    return tsvParseRows(chromSizesData)
        .filter(row => /^chr[0-9A-Z]+$/.test(row[0]))
        .map(([name, size]) => ({ name, size: parseInt(size) }));
}

/**
 *
 * @param {any} value
 * @return {value is ChromosomalLocus}
 */
export function isChromosomalLocus(value) {
    return "chromosome" in value;
}
