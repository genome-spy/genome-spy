import { formats as vegaFormats } from "vega-loader";

/**
 * A bare-bones FASTA-parser
 *
 * @typedef {object} SequenceEntry
 * @prop {string} identifier
 * @prop {string} sequence
 *
 * @param {string} data
 * @param {any} options
 * @returns {SequenceEntry[]}
 */
export default function fasta(data, options) {
    /** @type {SequenceEntry[]} */
    const sequences = [];

    /** @type {SequenceEntry | undefined} */
    let currentEntry;

    const lines = data.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;

        if (line.trim() == "") {
            continue;
        }

        if (line.startsWith(">")) {
            const [identifier] = line.slice(1).trim().split(/\s+/);
            if (!identifier) {
                throw new Error(
                    `Invalid FASTA header on line ${lineNumber}: missing identifier`
                );
            }

            currentEntry = { identifier, sequence: "" };
            sequences.push(currentEntry);
        } else if (currentEntry) {
            currentEntry.sequence += line.replace(/\s/g, "");
        } else {
            throw new Error(
                `Invalid FASTA file on line ${lineNumber}: sequence data before the first header`
            );
        }
    }

    return sequences;
}

vegaFormats("fasta", fasta);
