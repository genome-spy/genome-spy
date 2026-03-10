const blankLinePattern = /^\s*$/;
const controlLinePattern = /^\s*(?:browser\b|track\b|#)/;

/** @type {Promise<any> | undefined} */
let bedParserPromise;

async function loadBedParser() {
    bedParserPromise ??= import("@gmod/bed").then((mod) => mod.default);
    return bedParserPromise;
}

/**
 * Parse BED text data.
 *
 * @param {string} data
 * @returns {Promise<Record<string, any>[]>}
 */
export default async function bed(data) {
    const BED = await loadBedParser();
    const parser = new BED();
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
