import { format as d3format } from "d3-format";
import { isNumber } from "vega-util";

const numberFormat = d3format(",d");

/**
 * @param {import("../spec/genome").ChromosomalLocus} locus
 */
export function formatLocus(locus) {
    return locus.chrom + ":" + numberFormat(Math.floor(locus.pos + 1));
}

/**
 * @param {number | import("../spec/genome").ChromosomalLocus} locus
 */
export function locusOrNumberToString(locus) {
    return !isNumber(locus) && "chrom" in locus
        ? formatLocus(locus)
        : "" + locus;
}

/**
 * @param {import("../spec/genome").ChromosomalLocus} begin
 * @param {import("../spec/genome").ChromosomalLocus} end
 */
export function formatRange(begin, end) {
    return (
        begin.chrom +
        ":" +
        numberFormat(Math.floor(begin.pos + 1)) +
        "-" +
        (begin.chrom != end.chrom ? end.chrom + ":" : "") +
        numberFormat(Math.ceil(end.pos))
    );
}

// TODO: parseLocus, parseRange
