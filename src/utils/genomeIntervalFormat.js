import * as d3 from 'd3';
import Interval from "./interval";

export default class GenomeIntervalFormat {
    constructor(chromMapper) {
        this.chromMapper = chromMapper;
        this.numberFormat = d3.format(",d");
    }

    /**
     * Returns a UCSC Genome Browser -style string presentation of the interval.
     * However, the interval may span multiple chromosomes, which is incompatible
     * with UCSC.
     * 
     * The inteval is shown as one-based closed-open range.
     * See https://genome.ucsc.edu/FAQ/FAQtracks#tracks1
     */
    format(interval) {

        // Because of the open upper bound, one is first decreased from the upper bound and later added back.
        const begin = this.chromMapper.toChromosomal(interval.lower);
        const end = this.chromMapper.toChromosomal(interval.upper - 1);

        return begin.chromosome.name + ":" +
            this.numberFormat(Math.floor(begin.locus + 1)) + "-" +
            (begin.chromosome != end.chromosome ? (end.chromosome.name + ":") : "") +
            this.numberFormat(Math.ceil(end.locus + 1));
    }

    parse(str) {
        // TODO: consider changing [0-9XY] to support other species besides humans
        const matches = str.match(/^(chr[0-9XY]+):([0-9,]+)-(?:(chr[0-9XY]+):)?([0-9,]+)$/);

		if (matches) {
			const startChr = matches[1];
			const endChr = matches[3] || startChr;

			const startIndex = parseInt(matches[2].replace(/,/g, ""));
            const endIndex = parseInt(matches[4].replace(/,/g, ""));
            
            return new Interval(
                this.chromMapper.toContinuous(startChr, startIndex - 1),
                this.chromMapper.toContinuous(endChr, endIndex)
            );

		} else {
            return null;
        }
    }
}