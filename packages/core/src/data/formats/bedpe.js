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
 * BEDPE has fixed required leading columns; optional tail columns vary by producer.
 * Detect a header row by matching only the required prefix.
 *
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
    const explicitColumns = format.columns;
    let dataStarted = false;
    let columnsInitialized = false;
    let lineNumber = 0;

    /** @type {string[]} */
    const columns = [];
    /** @type {((value: string) => any)[]} */
    const normalizers = [];
    /** @type {Record<string, any>[]} */
    const rows = [];

    for (const line of lines) {
        lineNumber++;

        if (line.length == 0) {
            continue;
        }

        if (!dataStarted) {
            if (blankLinePattern.test(line) || controlLinePattern.test(line)) {
                continue;
            }
            dataStarted = true;
        }

        if (blankLinePattern.test(line)) {
            continue;
        }

        const row = line.split("\t");

        if (!columnsInitialized) {
            const baseColumns = explicitColumns
                ? explicitColumns
                : looksLikeHeaderRow(row)
                  ? row
                  : defaultColumns;

            for (const column of baseColumns) {
                columns.push(column);
                normalizers.push(columnNormalizers[column] ?? normalizeNone);
            }

            columnsInitialized = true;

            if (!explicitColumns && baseColumns == row) {
                continue;
            }
        }

        while (columns.length < row.length) {
            columns.push("field" + (columns.length + 1));
            normalizers.push(normalizeNone);
        }

        if (row.length < requiredColumns.length) {
            throw new Error(
                `BEDPE line ${lineNumber} has ${row.length} columns, expected at least ${requiredColumns.length}.`
            );
        }

        /** @type {Record<string, any>} */
        const datum = {};

        for (let i = 0; i < row.length; i++) {
            const columnName = columns[i];
            datum[columnName] = normalizers[i](row[i]);
        }

        rows.push(datum);
    }

    return rows;
}
