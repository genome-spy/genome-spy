import { format as d3format } from "d3-format";

const numberFormat = d3format(",d");

/**
 * @typedef {import("./genome").ChromosomalLocus} ChromosomalLocus
 */

/**
 * @param {ChromosomalLocus} locus
 */
export function formatLocus(locus) {
    return locus.chrom + ":" + numberFormat(Math.floor(locus.pos + 1));
}

/**
 * @param {ChromosomalLocus} begin
 * @param {ChromosomalLocus} end
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
