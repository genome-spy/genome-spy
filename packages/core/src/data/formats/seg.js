import {
    normalizeColumnName,
    parseTsvRowsWithLineNumbers,
} from "./tabularUtils.js";

const requiredFieldAliases = {
    sample: ["id", "sample"],
    chrom: ["chrom", "chromosome", "chr"],
    start: ["locstart", "start"],
    end: ["locend", "end"],
    numMarkers: ["nummark", "nummarkers"],
    segmentMean: ["segmean", "segmentmean"],
};

const commentPrefixes = ["#", "track", "browser"];

/**
 * @param {string[]} columns
 */
function resolveFieldIndexes(columns) {
    const normalizedToIndex = new Map(
        columns.map((columnName, i) => [normalizeColumnName(columnName), i])
    );

    /** @type {Record<string, number>} */
    const indexes = {};

    for (const [field, aliases] of Object.entries(requiredFieldAliases)) {
        const foundAlias = aliases.find((alias) =>
            normalizedToIndex.has(alias)
        );

        if (!foundAlias) {
            throw new Error(
                `SEG input is missing a required column for "${field}".`
            );
        }

        indexes[field] = /** @type {number} */ (
            normalizedToIndex.get(foundAlias)
        );
    }

    return indexes;
}

/**
 * @param {string} value
 * @param {string} fieldName
 * @param {number} lineNumber
 */
function parseInteger(value, fieldName, lineNumber) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
        throw new Error(
            `SEG line ${lineNumber} has a non-integer value in "${fieldName}": "${value}"`
        );
    }
    return parsed;
}

/**
 * @param {string} value
 * @param {string} fieldName
 * @param {number} lineNumber
 */
function parseNumber(value, fieldName, lineNumber) {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
        throw new Error(
            `SEG line ${lineNumber} has a non-numeric value in "${fieldName}": "${value}"`
        );
    }
    return parsed;
}

/**
 * @param {string} data
 * @param {{ columns?: string[] }} [format]
 */
export default function seg(data, format = {}) {
    const parsed = parseTsvRowsWithLineNumbers(data, {
        ignorePrefixes: commentPrefixes,
    });

    if (parsed.rows.length == 0) {
        return [];
    }

    const explicitColumns = format.columns;
    if (!explicitColumns && parsed.rows.length < 2) {
        throw new Error(
            "SEG input must contain a header row and at least one data row when format.columns is not provided."
        );
    }

    const columns = explicitColumns ? explicitColumns : parsed.rows[0];
    const fieldIndexes = resolveFieldIndexes(columns);
    const dataStart = explicitColumns ? 0 : 1;

    /** @type {Record<string, any>[]} */
    const rows = [];

    for (let i = dataStart; i < parsed.rows.length; i++) {
        const row = parsed.rows[i];
        const lineNumber = parsed.lineNumbers[i];

        if (row.length < columns.length) {
            throw new Error(
                `SEG line ${lineNumber} has fewer columns than expected (${row.length} < ${columns.length}).`
            );
        }

        /** @type {Record<string, any>} */
        const datum = {};

        for (let j = 0; j < columns.length; j++) {
            datum[columns[j]] = row[j];
        }

        const rawStart = parseInteger(
            row[fieldIndexes.start],
            "start",
            lineNumber
        );
        const rawEnd = parseInteger(row[fieldIndexes.end], "end", lineNumber);

        if (rawStart < 1) {
            throw new Error(
                `SEG line ${lineNumber} has an invalid start coordinate: ${rawStart}. SEG is expected to use one-based coordinates.`
            );
        }

        if (rawEnd < rawStart) {
            throw new Error(
                `SEG line ${lineNumber} has end < start (${rawEnd} < ${rawStart}).`
            );
        }

        datum.sample = row[fieldIndexes.sample];
        datum.chrom = row[fieldIndexes.chrom];
        datum.start = rawStart - 1;
        datum.end = rawEnd;
        datum.numMarkers = parseInteger(
            row[fieldIndexes.numMarkers],
            "numMarkers",
            lineNumber
        );
        datum.segmentMean = parseNumber(
            row[fieldIndexes.segmentMean],
            "segmentMean",
            lineNumber
        );

        rows.push(datum);
    }

    return rows;
}
