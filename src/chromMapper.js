import * as d3 from "d3";
import Interval from "./utils/interval";

export function chromMapper(chromSizes) {
    // TODO: Generalize and support other organisms beside human 
    const chromNames = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, "X", "Y"].map(v => "chr" + v);

    const cumReduction = chromNames.reduce((r, v) => {
        r.a.push(r.soFar);
        r.m[v] = r.soFar;
        r.soFar += chromSizes[v];
        return r;

    }, { soFar: 0, m: {}, a: [] });

    const cumulativeChromMap = cumReduction.m;
    const cumulativeChromArray = cumReduction.a;
    const extent = new Interval(0, cumReduction.soFar);

    // Add an imaginary extra chromosome to simplify calculations
    cumulativeChromArray.push(extent.width());

    const chromosomes = chromNames.map((chrom, i) => ({
        index: i,
        name: chrom,
        continuousInterval: new Interval(cumulativeChromArray[i], cumulativeChromArray[i + 1])
    }));

    /**
     * Prepend a "chr" prefix if it is missing.
     */
    function prefix(chrom) {
        if (typeof chrom == "string") {
            return chrom.startsWith("chr") ? chrom : "chr" + chrom;

        } else if (typeof chrom == "number") {
            return "chr" + chrom;
        }
    }

    return {
        extent: function () {
            return extent;
        },

        /**
         * Returns a chromosomal locus in continuous domain
         * 
         * @param {string} chromName 
         * @param {number} locus 
         */
        toContinuous: function (chromName, locus) {
            return cumulativeChromMap[prefix(chromName)] + locus;
        },

        /**
         * Returns a chromosomal segment as an Interval in continuous domain
         * 
         * @param {string} chromName 
         * @param {number} start 
         * @param {number} end 
         */
        segmentToContinuous: function (chromName, start, end) {
            const offset = cumulativeChromMap[prefix(chromName)];
            return new Interval(offset + start, offset + end);
        },

        toChromosomal(continuousLocus) {
            if (!extent.contains(continuousLocus)) return null;

            const i = d3.bisect(cumulativeChromArray, continuousLocus) - 1;
            return {
                chromosome: chromosomes[i],
                locus: continuousLocus - cumulativeChromArray[i]
            };
        },

        /**
         * Returns linear coordinates and chromosome names
         */
        chromosomes: () => chromosomes
    };
}