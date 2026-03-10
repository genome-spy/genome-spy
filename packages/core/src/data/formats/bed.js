import BED from "@gmod/bed";

const blankLinePattern = /^\s*$/;
const controlLinePattern = /^\s*(?:browser\b|track\b|#)/;

/**
 * Parse BED text data.
 *
 * @param {string} data
 * @returns {Record<string, any>[]}
 */
export default function bed(data) {
    const parser = new /** @type {any} */ (BED)();
    let dataStarted = false;

    /** @type {Record<string, any>[]} */
    const rows = [];

    const lines = data.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (!dataStarted) {
            if (blankLinePattern.test(line) || controlLinePattern.test(line)) {
                continue;
            }
            dataStarted = true;
        }

        try {
            rows.push(parser.parseLine(line));
        } catch (error) {
            throw new Error(
                `Cannot parse BED line ${i + 1}: ${
                    /** @type {Error} */ (error).message
                }`
            );
        }
    }

    return rows;
}
