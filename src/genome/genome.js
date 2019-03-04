import { tsvParseRows } from 'd3-dsv';
import { chromMapper } from "./chromMapper";

// TODO: Create an abstract "CoordinateSystem" base class

/**
 * @typedef {Object} GenomeConfig
 * @prop {string} name
 */

export default class Genome {
    /**
     * @param {GenomeConfig} config
     */
    constructor(config) {
        this.config = config;
    }

    get name() {
        return this.config.name;
    }

    async initialize() {

        // TODO: load chromsizes

        this.chromSizes = await fetch(`genome/${this.name}.chrom.sizes`)
            .then(res => res.text())
            .then(parseChromSizes);

        this.chromMapper = chromMapper(this.chromSizes);
    }
}

export function parseChromSizes(chromSizesData) {
    // TODO: Support other organisms too
    return new Map(tsvParseRows(chromSizesData)
        .filter(row => /^chr[0-9XY]{1,2}$/.test(row[0]))
        .map(([chrom, size]) => [chrom, parseInt(size)]));
}

/**
 * Parses a UCSC chromosome band table
 * 
 * See: https://genome.ucsc.edu/goldenpath/gbdDescriptionsOld.html#ChromosomeBand
 * 
 * @param {string} cytobandData cytoband table
 * @returns an array of cytoband objects
 */
export function parseUcscCytobands(cytobandData) {
    return tsvParseRows(cytobandData)
        // TODO: Support other organisms too
        .filter(b => /^chr[0-9XY]{1,2}$/.test(b[0]))
        .map(row => ({
            chrom: row[0],
            chromStart: +row[1],
            chromEnd: +row[2],
            name: row[3],
            gieStain: row[4]
        }));
}

/**
 * Builds a chromosome-sizes object from a cytoband array
 * 
 * @param {*} cytobands 
 */
export function cytobandsToChromSizes(cytobands) {
    const chromSizes = {};

    cytobands.forEach(band => {
        const chrom = band.chrom;
        chromSizes[chrom] = Math.max(
            chromSizes.hasOwnProperty(chrom) ? chromSizes[chrom] : 0,
            band.chromEnd + 1);
    });

    return chromSizes;
}