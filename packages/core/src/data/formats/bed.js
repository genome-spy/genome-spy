import BED from "@gmod/bed";

const controlLinePrefixes = ["browser", "track", "#"];

/**
 * @param {string} line
 */
function isSkippableBedLine(line) {
    const trimmed = line.trim();
    return (
        trimmed.length == 0 ||
        controlLinePrefixes.some((prefix) => trimmed.startsWith(prefix))
    );
}

/**
 * Parse BED text data.
 *
 * @param {string} data
 * @returns {Record<string, any>[]}
 */
export default function bed(data) {
    const parser = new /** @type {any} */ (BED)();

    /** @type {Record<string, any>[]} */
    const rows = [];

    const lines = data.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (isSkippableBedLine(line)) {
            continue;
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
