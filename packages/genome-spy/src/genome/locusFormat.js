import { format as d3format } from "d3-format";

const numberFormat = d3format(",d");

/**
 * @typedef {import("./chromMapper").ChromosomalLocus} ChromosomalLocus
 */

/**
 * @param {ChromosomalLocus} locus
 */
export function formatLocus(locus) {
    return locus.chromosome + ":" + numberFormat(Math.floor(locus.pos + 1));
}

/**
 * @param {ChromosomalLocus} begin
 * @param {ChromosomalLocus} end
 */
export function formatRange(begin, end) {
    return (
        begin.chromosome +
        ":" +
        numberFormat(Math.floor(begin.pos + 1)) +
        "-" +
        (begin.chromosome != end.chromosome ? end.chromosome + ":" : "") +
        numberFormat(Math.ceil(end.pos))
    );
}

// TODO: parseLocus, parseRange
