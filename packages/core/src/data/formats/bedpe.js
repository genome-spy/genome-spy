import { parseTsvRows } from "./tabularUtils.js";

const blankLinePattern = /^\s*$/;
const controlLinePattern = /^\s*(?:browser\b|track\b|#)/;

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

const normalizeNone = (/** @type {string} */ value) => value;
const normalizeStringSentinel = (/** @type {string} */ value) =>
    value == "." ? null : value;
const normalizeStrand = (/** @type {string} */ value) => {
    if (value == "+") {
        return 1;
    }
    if (value == "-") {
        return -1;
    }
    return 0;
};
const normalizeCoordinate = (/** @type {string} */ value) => {
    if (value == "." || value == "-1" || value == "") {
        return null;
    }
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
};
const normalizeScore = (/** @type {string} */ value) => {
    if (value == "." || value == "") {
        return null;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
};

/** @type {Record<string, (value: string) => any>} */
const columnNormalizers = {
    chrom1: normalizeStringSentinel,
    chrom2: normalizeStringSentinel,
    name: normalizeStringSentinel,
    strand1: normalizeStrand,
    strand2: normalizeStrand,
    start1: normalizeCoordinate,
    end1: normalizeCoordinate,
    start2: normalizeCoordinate,
    end2: normalizeCoordinate,
    score: normalizeScore,
};

/**
 * @param {string[]} row
 */
function looksLikeHeaderRow(row) {
    if (row.length < requiredColumns.length) {
        return false;
    }

    for (let i = 0; i < requiredColumns.length; i++) {
        if (row[i] != requiredColumns[i]) {
            return false;
        }
    }

    return true;
}

/**
 * @param {string} data
 * @param {{ columns?: string[] }} [format]
 */
export default function bedpe(data, format = {}) {
    const lines = data.split(/\r?\n/);
    let dataStarted = false;
    /** @type {string[]} */
    const dataLines = [];

    for (const line of lines) {
        if (!dataStarted) {
            if (blankLinePattern.test(line) || controlLinePattern.test(line)) {
                continue;
            }
            dataStarted = true;
        }
        dataLines.push(line);
    }

    const parsedRows = parseTsvRows(dataLines.join("\n"));

    if (parsedRows.length == 0) {
        return [];
    }

    let maxRowLength = 0;
    for (const row of parsedRows) {
        if (row.length > maxRowLength) {
            maxRowLength = row.length;
        }
    }

    const explicitColumns = format.columns;
    const headerRow = !explicitColumns && looksLikeHeaderRow(parsedRows[0]);

    const baseColumns = explicitColumns
        ? explicitColumns
        : headerRow
          ? parsedRows[0]
          : defaultColumns;

    /** @type {string[]} */
    const columns = Array.from(baseColumns);
    /** @type {((value: string) => any)[]} */
    const normalizers = columns.map(
        (column) => columnNormalizers[column] ?? normalizeNone
    );

    while (columns.length < maxRowLength) {
        columns.push("field" + (columns.length + 1));
        normalizers.push(normalizeNone);
    }

    const startIndex = headerRow ? 1 : 0;

    /** @type {Record<string, any>[]} */
    const rows = [];

    for (let i = startIndex; i < parsedRows.length; i++) {
        const row = parsedRows[i];

        if (row.length < requiredColumns.length) {
            continue;
        }

        /** @type {Record<string, any>} */
        const datum = {};

        for (let j = 0; j < row.length; j++) {
            const columnName = columns[j];
            datum[columnName] = normalizers[j](row[j]);
        }

        rows.push(datum);
    }

    return rows;
}
