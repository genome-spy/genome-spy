import { tsvParseRows } from 'd3-dsv';

export class Genome {
    constructor(name, { chromSizes = null, cytobands = null }) {
        this.name = name;

        if (cytobands) {
            this.cytobands = cytobands;
            this.chromSizes = cytobandsToChromSizes(cytobands);

        } else if (chromSizes) {
            this.chromSizes = chromSizes;

        } else {
            throw "Either chromSizes or cytobands must be defined!";
        }
    }
}

// TODO: parseUcscChromSizes()

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