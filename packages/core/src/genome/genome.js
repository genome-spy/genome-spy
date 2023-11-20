import { bisect } from "d3-array";
import { tsvParseRows } from "d3-dsv";
import { loader } from "vega-loader";
import { isObject } from "vega-util";
import { formatRange } from "./locusFormat.js";

const defaultBaseUrl = "https://genomespy.app/data/genomes/";

/**
 * @typedef {import("../spec/genome.js").GenomeConfig} GenomeConfig
 * @typedef {import("../spec/genome.js").ChromosomalLocus} ChromosomalLocus
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
 *
 * @typedef {object} DiscreteChromosomeInterval
 * @prop {string} chrom
 * @prop {number} startPos
 * @prop {number} endPos
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

    hasChrPrefix() {
        return this.chromosomes.some((c) => c.name.startsWith("chr"));
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
                odd: !(i & 1),
            };

            this.chromosomes.push(chrom);

            const plain = chrom.name.replace(/^chr/i, "");
            for (const name of [
                "chr" + plain,
                "CHR" + plain,
                "Chr" + plain,
                // The number is a bit fragile because it depends on the order of the chromosomes.
                // It probably works for autosomes, but X, Y, M, etc., not necessarily.
                chrom.number,
                "" + chrom.number,
                plain,
                chrom.name,
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
        // Position equal to the length is a special case needed because the intervals
        // are half-open.
        if (continuousPos > this.totalSize) {
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
            chrom: chrom.name,
            pos: Math.floor(continuousPos) - chrom.continuousStart,
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
        const end = this.toChromosomal(interval[1] - 0.5);
        end.pos += 1;

        return [begin, end];
    }

    /**
     * Returns a continuous interval. The optional position of the left end defaults to zero,
     * the right end defaults to the size of the chromosome. Thus, the chromosome is inclusive
     * when positions are omitted.
     *
     * @param {ChromosomalLocus[]} chromosomal
     */
    toContinuousInterval(chromosomal) {
        let [a, b] = chromosomal;
        if (!b) {
            // A shortcut for a single chromosome. { domain: [{ chrom: "chr3" }] }
            b = a;
        }

        return [
            this.toContinuous(a.chrom, a.pos ?? 0),
            this.toContinuous(
                b.chrom,
                b.pos ?? this.chromosomesByName.get(b.chrom)?.size
            ),
        ];
    }

    /**
     * Returns an array of discrete chromosome intervals that fall within the given interval.
     *
     * @param {[ChromosomalLocus, ChromosomalLocus]} interval
     * @returns {DiscreteChromosomeInterval[]}
     */
    toDiscreteChromosomeIntervals(interval) {
        const a = interval[0];
        const b = interval[1];

        const intervals = [];

        if (a.chrom === b.chrom) {
            intervals.push({ chrom: a.chrom, startPos: a.pos, endPos: b.pos });
        } else {
            const startIndex = this.chromosomes.findIndex(
                (chrom) => chrom.name === a.chrom
            );
            const endIndex = this.chromosomes.findIndex(
                (chrom) => chrom.name === b.chrom
            );

            intervals.push({
                chrom: a.chrom,
                startPos: a.pos,
                endPos: this.chromosomes[startIndex].size,
            });
            for (let i = startIndex + 1; i < endIndex; i++) {
                intervals.push({
                    chrom: this.chromosomes[i].name,
                    startPos: 0,
                    endPos: this.chromosomes[i].size,
                });
            }
            intervals.push({ chrom: b.chrom, startPos: 0, endPos: b.pos });
        }
        return intervals;
    }

    /**
     * Returns an array of discrete chromosome intervals that fall within the given interval.
     *
     * @param {number[]} continuousInterval
     */
    continuousToDiscreteChromosomeIntervals(continuousInterval) {
        return this.toDiscreteChromosomeIntervals([
            this.toChromosomal(continuousInterval[0]),
            this.toChromosomal(continuousInterval[1]),
        ]);
    }

    /**
     *
     * @param {string} str
     * @returns {[number, number]}
     */
    parseInterval(str) {
        // TODO: consider changing [0-9XY] to support other species besides humans
        const matches = str.match(
            /^(chr[0-9A-Z]+)(?::([0-9,]+)(?:-(?:(chr[0-9A-Z]+):)?([0-9,]+))?)?$/
        );

        if (matches) {
            const startChr = matches[1];

            if (matches.slice(2).every((x) => x === undefined)) {
                const chrom = this.getChromosome(startChr);
                if (chrom) {
                    return [chrom.continuousStart, chrom.continuousEnd];
                }
                return;
            }

            const endChr = matches[3] || startChr;

            const startIndex = parseInt(matches[2].replace(/,/g, ""));
            const endIndex =
                matches[4] !== undefined
                    ? parseInt(matches[4].replace(/,/g, ""))
                    : startIndex;

            return [
                this.toContinuous(startChr, startIndex - 1),
                this.toContinuous(endChr, endIndex),
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
        .filter((row) => /^chr[0-9A-Z]+$/.test(row[0]))
        .map(([name, size]) => ({ name, size: parseInt(size) }));
}

/**
 *
 * @param {any} value
 * @return {value is ChromosomalLocus}
 */
export function isChromosomalLocus(value) {
    return isObject(value) && "chrom" in value;
}

/**
 *
 * @param {any[]} value
 * @return {value is ChromosomalLocus[]}
 */
export function isChromosomalLocusInterval(value) {
    return value.every(isChromosomalLocus);
}
