import { normalizeColumnName, parseTsvRows } from "./tabularUtils.js";

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
 */
function parseIntegerOrNull(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
}

/**
 * @param {string} value
 */
function parseNumberOrNull(value) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
}

/**
 * @param {string} data
 * @param {{ columns?: string[] }} [format]
 */
export default function seg(data, format = {}) {
    const parsedRows = parseTsvRows(data, {
        ignorePrefixes: commentPrefixes,
    });

    if (parsedRows.length == 0) {
        return [];
    }

    const explicitColumns = format.columns;
    if (!explicitColumns && parsedRows.length < 2) {
        throw new Error(
            "SEG input must contain a header row and at least one data row when format.columns is not provided."
        );
    }

    const columns = explicitColumns ? explicitColumns : parsedRows[0];
    const fieldIndexes = resolveFieldIndexes(columns);
    const dataStart = explicitColumns ? 0 : 1;

    /** @type {Record<string, any>[]} */
    const rows = [];

    for (let i = dataStart; i < parsedRows.length; i++) {
        const row = parsedRows[i];

        /** @type {Record<string, any>} */
        const datum = {};

        for (let j = 0; j < columns.length; j++) {
            datum[columns[j]] = row[j];
        }

        const rawStart = parseIntegerOrNull(row[fieldIndexes.start]);
        const rawEnd = parseIntegerOrNull(row[fieldIndexes.end]);

        datum.sample = row[fieldIndexes.sample];
        datum.chrom = row[fieldIndexes.chrom];
        datum.start = rawStart === null || rawStart < 1 ? null : rawStart - 1;
        datum.end = rawEnd;
        datum.numMarkers = parseIntegerOrNull(row[fieldIndexes.numMarkers]);
        datum.segmentMean = parseNumberOrNull(row[fieldIndexes.segmentMean]);

        rows.push(datum);
    }

    return rows;
}
