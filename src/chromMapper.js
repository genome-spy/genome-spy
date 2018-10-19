import * as d3 from "d3";

export function chromMapper(chromSizes) {
	const chroms = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, "X", "Y"].map(v => "chr" + v);

	const cumReduction = chroms.reduce((r, v) => {
		r.a.push(r.soFar);
		r.m[v] = r.soFar;
		r.soFar += chromSizes[v];
		return r;

	}, { soFar: 0, m: {}, a: [] });

	const cumulativeChromMap = cumReduction.m;
	const cumulativeChromArray = cumReduction.a;
	const totalSize = cumReduction.soFar;

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
		linLoc: function (chromLoc) {
			return this.chromStart(chromLoc[0]) + chromLoc[1];
		},

		chromLoc: function (linLoc) {
			if (linLoc >= 0) {
				const i = d3.bisect(cumulativeChromArray, linLoc) - 1;
				return [chroms[i], linLoc - cumulativeChromArray[i]];
			} else {
				return [chroms[0], 0];
			}
		},

		chromStart: function (chrom) {
			return cumulativeChromMap[prefix(chrom)];
		},

		chromEnd: function (chrom) {
			return this.chromStart(chrom) + chromSizes[prefix(chrom)];
		},

		linearChromPositions: function () {
			return cumulativeChromArray;
		},

		extent: function () {
			return [0, totalSize];
		}

	}
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