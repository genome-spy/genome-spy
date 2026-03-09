import {
    normalizeColumnName,
    parseTsvRowsWithLineNumbers,
} from "./tabularUtils.js";

const defaultColumns = [
    "chrom1",
    "start1",
    "end1",
    "chrom2",
    "start2",
    "end2",
    "name",
    "score",
    "strand1",
    "strand2",
];

const requiredColumns = defaultColumns.slice(0, 6);

const commentPrefixes = ["#", "track", "browser"];

const stringFieldsWithSentinels = new Set([
    "chrom1",
    "chrom2",
    "name",
    "strand1",
    "strand2",
]);

const coordinateFields = new Set(["start1", "end1", "start2", "end2"]);

/**
 * @param {string[]} row
 */
function looksLikeHeaderRow(row) {
    if (row.length < requiredColumns.length) {
        return false;
    }

    for (let i = 0; i < requiredColumns.length; i++) {
        if (normalizeColumnName(row[i]) != requiredColumns[i]) {
            return false;
        }
    }

    return true;
}

/**
 * @param {string} columnName
 * @param {string} value
 * @param {number} sourceLine
 */
function normalizeValue(columnName, value, sourceLine) {
    if (stringFieldsWithSentinels.has(columnName) && value == ".") {
        return null;
    }

    if (coordinateFields.has(columnName)) {
        if (value == "." || value == "-1" || value == "") {
            return null;
        }

        const parsed = Number(value);
        if (!Number.isInteger(parsed)) {
            throw new Error(
                `BEDPE line ${sourceLine} has a non-integer coordinate in "${columnName}": "${value}"`
            );
        }
        return parsed;
    }

    if (columnName == "score") {
        if (value == "." || value == "") {
            return null;
        }

        const parsed = Number(value);
        return Number.isNaN(parsed) ? value : parsed;
    }

    return value;
}

/**
 * @param {string} data
 * @param {{ columns?: string[] }} [format]
 */
export default function bedpe(data, format = {}) {
    const parsed = parseTsvRowsWithLineNumbers(data, {
        ignorePrefixes: commentPrefixes,
    });

    if (parsed.rows.length == 0) {
        return [];
    }

    const maxRowLength = parsed.rows.reduce(
        (max, row) => Math.max(max, row.length),
        0
    );

    const explicitColumns = format.columns;
    const headerRow = !explicitColumns && looksLikeHeaderRow(parsed.rows[0]);

    const baseColumns = explicitColumns
        ? explicitColumns
        : headerRow
          ? parsed.rows[0]
          : defaultColumns;

    /** @type {string[]} */
    const columns = Array.from(baseColumns);

    while (columns.length < maxRowLength) {
        columns.push("field" + (columns.length + 1));
    }

    const startIndex = headerRow ? 1 : 0;

    /** @type {Record<string, any>[]} */
    const rows = [];

    for (let i = startIndex; i < parsed.rows.length; i++) {
        const sourceLine = parsed.lineNumbers[i];
        const row = parsed.rows[i];

        if (row.length < requiredColumns.length) {
            throw new Error(
                `BEDPE line ${sourceLine} has ${row.length} fields. At least 6 fields are required.`
            );
        }

        /** @type {Record<string, any>} */
        const datum = {};

        for (let j = 0; j < row.length; j++) {
            const columnName = columns[j];
            datum[columnName] = normalizeValue(columnName, row[j], sourceLine);
        }

        rows.push(datum);
    }

    return rows;
}
