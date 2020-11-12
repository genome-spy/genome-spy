import { bisect } from "d3-array";
import Interval from "../utils/interval";

/**
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
 * @prop {Interval} continuousInterval
 * @prop {boolean} odd true if odd chrom number
 */

/**
 * Blaa
 */
export default class ChromMapper {
    /**
     *
     * @param {Chromosome[]} chromosomes
     */
    constructor(chromosomes) {
        this.chromosomes = /** @type {(Chromosome & ChromosomeAnnotation)[]} */ ([
            ...chromosomes
        ]);

        /** @type {number[]} */
        this.startByIndex = [0];

        /** @type {Map<string, number>} */
        this.startByName = new Map();

        /** @type {Map<string, Chromosome & ChromosomeAnnotation>} */
        this.chromosomesByName = new Map();

        let pos = 0;
        for (let i = 0; i < this.chromosomes.length; i++) {
            const chrom = this.chromosomes[i];

            this.startByIndex.push(pos);
            this.startByName.set(chrom.name, pos);

            chrom.continuousStart = pos;
            chrom.continuousEnd = pos + chrom.size;
            chrom.continuousInterval = new Interval(pos, pos + chrom.size);
            chrom.index = i;
            chrom.number = i + 1;
            // eslint-disable-next-line no-bitwise
            chrom.odd = !!(chrom.number & 1);

            this.chromosomesByName.set(chrom.name, chrom);

            pos += chrom.size;
        }

        this.totalSize = pos;

        // Cache previous chromosome lookup. It's faster than accessing the map.
        /** @type {string | number} */
        this._lastChrom = undefined;
        this._lastOffset = 0;
    }

    /**
     * Returns a chromosomal locus in the continuous domain
     *
     * @param {string | number} chrom A number or name with or without a "chr" prefix. Examples: 23, chrX, X
     * @param {number} pos zero-based cordinate
     */
    toContinuous(chrom, pos) {
        pos = +pos;

        /** @type {number} */
        let offset;

        if (chrom === this._lastChrom) {
            offset = this._lastOffset;
        } else {
            if (typeof chrom === "number") {
                if (chrom > 0 && chrom <= this.startByIndex.length) {
                    offset = this.startByIndex[chrom];
                }
            } else {
                offset = this.startByName.get(chrom);
                if (offset === undefined) {
                    offset = this.startByName.get("chr" + chrom);
                }
            }
            this._lastChrom = chrom;
            this._lastOffset = offset;
        }

        if (offset !== undefined) {
            return offset + pos;
        }
    }

    /**
     *
     * @param {number} continuousPos
     * @returns {ChromosomalLocus}
     */
    toChromosomal(continuousPos) {
        if (continuousPos >= this.totalSize) {
            return; // TODO: Consider displaying a warning
        }

        continuousPos = Math.floor(continuousPos);

        const i = bisect(this.startByIndex, continuousPos) - 1;
        if (i > 0 && i <= this.chromosomes.length) {
            return {
                chromosome: this.chromosomes[i - 1].name,
                pos: continuousPos - this.startByIndex[i]
            };
        }
    }

    /**
     * @param {string} chrom
     * @param {number} start
     * @param {number} end
     */
    segmentToContinuous(chrom, start, end) {
        const offset = this.startByName.get(chrom);
        return new Interval(offset + start, offset + end);
    }

    getChromosomes() {
        return this.chromosomes;
    }

    /**
     *
     * @param {string} name
     */
    getChromosome(name) {
        return this.chromosomesByName.get(name);
    }
}
