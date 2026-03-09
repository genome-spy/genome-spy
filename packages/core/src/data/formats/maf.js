import {
    normalizeColumnName,
    parseTsvRowsWithLineNumbers,
} from "./tabularUtils.js";

const requiredFieldAliases = {
    Hugo_Symbol: ["hugosymbol"],
    Chromosome: ["chromosome", "chrom"],
    Start_Position: ["startposition", "start"],
    End_Position: ["endposition", "end"],
    Reference_Allele: ["referenceallele", "ref"],
    Tumor_Seq_Allele2: ["tumorseqallele2", "alt", "altallele"],
    Tumor_Sample_Barcode: ["tumorsamplebarcode", "sample", "sampleid"],
};

const commentPrefixes = ["#"];

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
                'MAF input is missing a required column for "' + field + '".'
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
            "MAF line " +
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
 * @param {string} data
 * @param {{ columns?: string[] }} [format]
 */
export default function maf(data, format = {}) {
    const parsed = parseTsvRowsWithLineNumbers(data, {
        ignorePrefixes: commentPrefixes,
    });

    if (parsed.rows.length == 0) {
        return [];
    }

    const explicitColumns = format.columns;
    if (!explicitColumns && parsed.rows.length < 2) {
        throw new Error(
            "MAF input must contain a header row and at least one data row when format.columns is not provided."
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
                "MAF line " +
                    lineNumber +
                    " has fewer columns than expected (" +
                    row.length +
                    " < " +
                    columns.length +
                    ")."
            );
        }

        /** @type {Record<string, any>} */
        const datum = {};

        for (let j = 0; j < columns.length; j++) {
            datum[columns[j]] = row[j];
        }

        const rawStart = parseInteger(
            row[fieldIndexes.Start_Position],
            "Start_Position",
            lineNumber
        );
        const rawEnd = parseInteger(
            row[fieldIndexes.End_Position],
            "End_Position",
            lineNumber
        );

        if (rawStart < 1) {
            throw new Error(
                "MAF line " +
                    lineNumber +
                    " has an invalid start coordinate: " +
                    rawStart +
                    ". MAF is expected to use one-based coordinates."
            );
        }

        if (rawEnd < rawStart) {
            throw new Error(
                "MAF line " +
                    lineNumber +
                    " has End_Position < Start_Position (" +
                    rawEnd +
                    " < " +
                    rawStart +
                    ")."
            );
        }

        datum.Hugo_Symbol = row[fieldIndexes.Hugo_Symbol];
        datum.Chromosome = row[fieldIndexes.Chromosome];
        datum.Start_Position = rawStart;
        datum.End_Position = rawEnd;
        datum.Reference_Allele = row[fieldIndexes.Reference_Allele];
        datum.Tumor_Seq_Allele2 = row[fieldIndexes.Tumor_Seq_Allele2];
        datum.Tumor_Sample_Barcode = row[fieldIndexes.Tumor_Sample_Barcode];

        // Canonical genome fields
        datum.chrom = datum.Chromosome;
        datum.start = rawStart - 1;
        datum.end = rawEnd;
        datum.sample = datum.Tumor_Sample_Barcode;

        rows.push(datum);
    }

    return rows;
}
