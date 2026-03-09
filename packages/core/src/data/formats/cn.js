import { normalizeColumnName, parseTsvRows } from "./tabularUtils.js";

const commentPrefixes = ["#"];

const fieldAliases = {
    sample: ["sample", "sampleid"],
    chrom: ["chrom", "chromosome", "chr"],
    start: ["start", "locstart", "chromstart"],
    end: ["end", "locend", "chromend"],
    value: ["value", "cn", "copynumber", "segmentmean", "segmean", "log2"],
};

const matrixMetadataColumns = new Set([
    "chrom",
    "chromosome",
    "chr",
    "start",
    "locstart",
    "chromstart",
    "end",
    "locend",
    "chromend",
    "name",
    "description",
    "gene",
    "locus",
]);

/**
 * @param {string[]} columns
 */
function makeNormalizedColumnIndex(columns) {
    return new Map(
        columns.map((columnName, i) => [normalizeColumnName(columnName), i])
    );
}

/**
 * @param {Map<string, number>} normalizedIndex
 * @param {string[]} aliases
 */
function findColumnIndex(normalizedIndex, aliases) {
    const alias = aliases.find((candidate) => normalizedIndex.has(candidate));
    return alias ? normalizedIndex.get(alias) : undefined;
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
 * @param {string[]} columns
 */
function detectLayout(columns) {
    const normalizedIndex = makeNormalizedColumnIndex(columns);

    const chromIndex = findColumnIndex(normalizedIndex, fieldAliases.chrom);
    const startIndex = findColumnIndex(normalizedIndex, fieldAliases.start);
    const endIndex = findColumnIndex(normalizedIndex, fieldAliases.end);

    if (
        chromIndex === undefined ||
        startIndex === undefined ||
        endIndex === undefined
    ) {
        throw new Error(
            "CN input is missing required genomic coordinate columns (chrom/start/end)."
        );
    }

    const sampleIndex = findColumnIndex(normalizedIndex, fieldAliases.sample);
    const valueIndex = findColumnIndex(normalizedIndex, fieldAliases.value);

    if (sampleIndex !== undefined && valueIndex !== undefined) {
        return {
            layout: "segment",
            chromIndex,
            startIndex,
            endIndex,
            sampleIndex,
            valueIndex,
        };
    }

    if (sampleIndex !== undefined && valueIndex === undefined) {
        throw new Error(
            "CN input has a sample column but no recognized value column for segment layout."
        );
    }

    if (sampleIndex === undefined && valueIndex !== undefined) {
        throw new Error(
            'CN input has a recognized value column but no sample column. Use "sample" or "sample_id" for segment layout.'
        );
    }

    const valueAliases = new Set(fieldAliases.value);

    /** @type {number[]} */
    const sampleColumns = [];
    for (let i = 0; i < columns.length; i++) {
        const normalized = normalizeColumnName(columns[i]);
        if (
            !matrixMetadataColumns.has(normalized) &&
            !valueAliases.has(normalized)
        ) {
            sampleColumns.push(i);
        }
    }

    if (sampleColumns.length > 0) {
        return {
            layout: "matrix",
            chromIndex,
            startIndex,
            endIndex,
            sampleColumns,
        };
    }

    throw new Error(
        'CN input does not match supported layouts. Expected either segment layout ("sample" + value column) or matrix layout (sample columns).'
    );
}

/**
 * @param {number} rawStart
 * @param {number} rawEnd
 */
function normalizeCoordinates(rawStart, rawEnd) {
    return {
        start: rawStart === null || rawStart < 1 ? null : rawStart - 1,
        end: rawEnd,
    };
}

/**
 * @param {string} value
 */
function parseValueOrNull(value) {
    if (value == "" || value == "." || value == "NA") {
        return null;
    }

    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
}

/**
 * @param {string} data
 * @param {{ columns?: string[] }} [format]
 */
export default function cn(data, format = {}) {
    const parsedRows = parseTsvRows(data, {
        ignorePrefixes: commentPrefixes,
    });

    if (parsedRows.length == 0) {
        return [];
    }

    const explicitColumns = format.columns;
    if (!explicitColumns && parsedRows.length < 2) {
        throw new Error(
            "CN input must contain a header row and at least one data row when format.columns is not provided."
        );
    }

    const columns = explicitColumns ? explicitColumns : parsedRows[0];
    const layout = detectLayout(columns);
    const dataStart = explicitColumns ? 0 : 1;

    /** @type {Record<string, any>[]} */
    const rows = [];

    for (let i = dataStart; i < parsedRows.length; i++) {
        const row = parsedRows[i];

        const chrom = row[layout.chromIndex];
        const rawStart = parseIntegerOrNull(row[layout.startIndex]);
        const rawEnd = parseIntegerOrNull(row[layout.endIndex]);
        const normalizedCoordinates = normalizeCoordinates(rawStart, rawEnd);

        if (layout.layout == "segment") {
            /** @type {Record<string, any>} */
            const datum = {};

            for (let j = 0; j < columns.length; j++) {
                datum[columns[j]] = row[j];
            }

            datum.sample = row[layout.sampleIndex];
            datum.chrom = chrom;
            datum.start = normalizedCoordinates.start;
            datum.end = normalizedCoordinates.end;
            datum.value = parseNumberOrNull(row[layout.valueIndex]);

            rows.push(datum);
        } else {
            /** @type {Record<string, any>} */
            const metadata = {};

            for (const [j, column] of columns.entries()) {
                if (!layout.sampleColumns.includes(j)) {
                    metadata[column] = row[j];
                }
            }

            for (const sampleColumn of layout.sampleColumns) {
                rows.push({
                    ...metadata,
                    sample: columns[sampleColumn],
                    chrom,
                    start: normalizedCoordinates.start,
                    end: normalizedCoordinates.end,
                    value: parseValueOrNull(row[sampleColumn]),
                });
            }
        }
    }

    return rows;
}
