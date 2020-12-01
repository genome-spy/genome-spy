/**
 * @typedef {object} FlattenExonsConfig
 * @prop {string} exons
 * @prop {string} startpos
 * @prop {string[]} as
 */

/**
 * Flattens "run-length encoded" exons. The transforms inputs the start
 * coordinate of the gene body and a comma-delimited string of alternating
 * exon and intron lengths. A new row is created for each exon.
 *
 * @param {*} config
 * @param {any[]} rows
 */
export default function flattenCompressedExonsTranform(config, rows) {
    // TODO: Check that gene length equals to cumulative length

    const exons = config.exons || "exons";
    const startpos = config.startpos || "start";
    const [exonStart, exonEnd] = config.as || ["exonStart", "exonEnd"];

    /** @type {any[]} */
    const newRows = [];

    for (const row of rows) {
        const steps = row[exons].split(",");

        let upper = row[startpos];
        let lower = upper;

        for (let i = 0; i < steps.length; ) {
            lower = upper + parseInt(steps[i++], 10);
            upper = lower + parseInt(steps[i++], 10);

            // Use the original row as a prototype
            const newRow = Object.create(row);
            newRow[exonStart] = lower;
            newRow[exonEnd] = upper;

            newRows.push(newRow);
        }
    }

    return newRows;
}
