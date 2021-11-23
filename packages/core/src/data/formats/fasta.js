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

    /** @type {SequenceEntry} */
    let currentEntry;

    for (const line of data.split("\n")) {
        if (line.startsWith(">")) {
            const identifier = line.match(/>(\S+)/)[1];
            currentEntry = { identifier, sequence: "" };
            sequences.push(currentEntry);
        } else if (currentEntry) {
            currentEntry.sequence += line.trim();
        } else {
            throw new Error("Invalid fasta file!");
        }
    }

    return sequences;
}
