/**
 * @typedef {object} FlattenExonsConfig
 * @prop {string} exons
 * @prop {string} startpos
 * @prop {string[]} as
 */

import numberExtractor from "../../utils/numberExtractor";

/**
 * Flattens "run-length encoded" exons. The transforms inputs the start
 * coordinate of the gene body and a comma-delimited string of alternating
 * exon and intron lengths. A new row is created for each exon.
 *
 * @param {*} config
 * @param {any[]} rows
 */
export default function flattenCompressedExonsTranform(config, rows) {
    const exons = config.exons || "exons";
    const startpos = config.startpos || "start";
    const [exonStart, exonEnd] = config.as || ["exonStart", "exonEnd"];

    /** @type {any[]} */
    const newRows = [];

    for (const row of rows) {
        let upper = row[startpos];
        let lower = upper;

        let inExon = true;
        for (const token of numberExtractor(row[exons])) {
            if (inExon) {
                lower = upper + token;
            } else {
                upper = lower + token;

                // Use the original row as a prototype
                const newRow = Object.create(row);
                newRow[exonStart] = lower;
                newRow[exonEnd] = upper;

                newRows.push(newRow);
            }

            inExon = !inExon;
        }
    }

    return newRows;
}
