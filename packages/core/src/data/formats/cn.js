import {
    normalizeColumnName,
    parseTsvRowsWithLineNumbers,
} from "./tabularUtils.js";

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
 * @param {string} fieldName
 * @param {number} lineNumber
 */
function parseInteger(value, fieldName, lineNumber) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
        throw new Error(
            "CN line " +
                lineNumber +
                ' has a non-integer value in "' +
                fieldName +
                '": "' +
                value +
                '"'
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
            "CN line " +
                lineNumber +
                ' has a non-numeric value in "' +
                fieldName +
                '": "' +
                value +
                '"'
        );
    }
    return parsed;
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
 * @param {number} lineNumber
 */
function normalizeCoordinates(rawStart, rawEnd, lineNumber) {
    if (rawStart < 1) {
        throw new Error(
            "CN line " +
                lineNumber +
                " has an invalid start coordinate: " +
                rawStart +
                ". CN is expected to use one-based coordinates."
        );
    }

    if (rawEnd < rawStart) {
        throw new Error(
            "CN line " +
                lineNumber +
                " has end < start (" +
                rawEnd +
                " < " +
                rawStart +
                ")."
        );
    }

    return {
        start: rawStart - 1,
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
    const parsed = parseTsvRowsWithLineNumbers(data, {
        ignorePrefixes: commentPrefixes,
    });

    if (parsed.rows.length == 0) {
        return [];
    }

    const explicitColumns = format.columns;
    if (!explicitColumns && parsed.rows.length < 2) {
        throw new Error(
            "CN input must contain a header row and at least one data row when format.columns is not provided."
        );
    }

    const columns = explicitColumns ? explicitColumns : parsed.rows[0];
    const layout = detectLayout(columns);
    const dataStart = explicitColumns ? 0 : 1;

    /** @type {Record<string, any>[]} */
    const rows = [];

    for (let i = dataStart; i < parsed.rows.length; i++) {
        const row = parsed.rows[i];
        const lineNumber = parsed.lineNumbers[i];

        if (row.length < columns.length) {
            throw new Error(
                "CN line " +
                    lineNumber +
                    " has fewer columns than expected (" +
                    row.length +
                    " < " +
                    columns.length +
                    ")."
            );
        }

        const chrom = row[layout.chromIndex];
        const rawStart = parseInteger(
            row[layout.startIndex],
            "start",
            lineNumber
        );
        const rawEnd = parseInteger(row[layout.endIndex], "end", lineNumber);
        const normalizedCoordinates = normalizeCoordinates(
            rawStart,
            rawEnd,
            lineNumber
        );

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
            datum.value = parseNumber(
                row[layout.valueIndex],
                columns[layout.valueIndex],
                lineNumber
            );

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
