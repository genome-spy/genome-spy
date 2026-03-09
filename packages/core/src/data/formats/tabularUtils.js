import { tsvParseRows } from "d3-dsv";

/**
 * @typedef {object} ParsedTsvRows
 * @prop {string[][]} rows
 * @prop {number[]} lineNumbers
 */

/**
 * Parses tab-delimited rows while preserving source line numbers for
 * diagnostics.
 *
 * @param {string} data
 * @param {{ ignorePrefixes?: string[] }} [options]
 * @returns {ParsedTsvRows}
 */
export function parseTsvRowsWithLineNumbers(data, options = {}) {
    const ignorePrefixes = options.ignorePrefixes ?? [];

    /** @type {string[]} */
    const lines = [];

    /** @type {number[]} */
    const lineNumbers = [];

    for (const [i, line] of data.split(/\r?\n/).entries()) {
        const trimmed = line.trim();

        if (
            trimmed.length == 0 ||
            ignorePrefixes.some((prefix) => trimmed.startsWith(prefix))
        ) {
            continue;
        }

        lines.push(line);
        lineNumbers.push(i + 1);
    }

    if (lines.length == 0) {
        return { rows: [], lineNumbers: [] };
    }

    return {
        rows: tsvParseRows(lines.join("\n")),
        lineNumbers,
    };
}

/**
 * @param {string} name
 */
export function normalizeColumnName(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
