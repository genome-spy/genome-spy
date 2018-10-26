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
	const totalLength = cumReduction.soFar;

	// Add an imaginary extra chromosome to simplify calculations
	cumulativeChromArray.push(totalLength);

	const chromosomes = chromNames.map((chrom, i) => ({
		index: i,
		name: chrom,
		continuousInterval: new Interval(cumulativeChromArray[i],cumulativeChromArray[i + 1])
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
			return [0, totalLength];
		},

		/**
		 * Returns a chromosomal locus in continuous domain
		 * 
		 * @param {string} chromName 
		 * @param {number} locus 
		 */
		toContinuous: function(chromName, locus) {
			return cumulativeChromMap[prefix(chromName)] + locus;
		},

		toChromosomal(continuousLocus) {
			if (continuousLocus >= totalLength || continuousLocus < 0) return null;

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

export function extractChromSizes(cytobands) {
	const chromSizes = {};

	cytobands.forEach(band => {
		const chrom = band[0];
		const end = +band[2];
		chromSizes[chrom] = Math.max(chromSizes.hasOwnProperty(chrom) ? chromSizes[chrom] : 0, end);
	});

	return chromSizes;
}