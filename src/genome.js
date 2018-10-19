import * as d3 from 'd3';

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

export function parseCytobands(cytobandData) {
    return d3.tsvParseRows(cytobandData).filter(b => /^chr[0-9XY]{1,2}$/.test(b[0]));
}

export function cytobandsToChromSizes(cytobands) {
	const chromSizes = {};

	cytobands.forEach(band => {
		const chrom = band[0];
		const end = +band[2];
		chromSizes[chrom] = Math.max(chromSizes.hasOwnProperty(chrom) ? chromSizes[chrom] : 0, end);
	});

	return chromSizes;
}