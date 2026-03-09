import { tsvParseRows } from "d3-dsv";

/**
 * Parses tab-delimited rows and filters comment/control lines.
 *
 * @param {string} data
 * @param {{ ignorePrefixes?: string[] }} [options]
 * @returns {string[][]}
 */
export function parseTsvRows(data, options = {}) {
    const ignorePrefixes = options.ignorePrefixes ?? [];
    const rows = tsvParseRows(data);

    return rows.filter((row) => {
        if (row.length == 0) {
            return false;
        }

        const firstCell = row[0].trim();
        if (firstCell.length == 0 && row.length == 1) {
            return false;
        }

        return !ignorePrefixes.some((prefix) => firstCell.startsWith(prefix));
    });
}

/**
 * @param {string} data
 * @param {{ ignorePrefixes?: string[] }} [options]
 */
export function parseTsvRowsWithLineNumbers(data, options = {}) {
    const rows = parseTsvRows(data, options);
    return { rows, lineNumbers: rows.map((_, i) => i + 1) };
}

/**
 * @param {string} name
 */
export function normalizeColumnName(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
