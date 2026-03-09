import { normalizeColumnName, parseTsvRows } from "./tabularUtils.js";

const requiredFieldAliases = {
    Hugo_Symbol: ["hugosymbol"],
    Chromosome: ["chromosome"],
    Start_Position: ["startposition"],
    End_Position: ["endposition"],
    Reference_Allele: ["referenceallele"],
    Tumor_Seq_Allele2: ["tumorseqallele2"],
    Tumor_Sample_Barcode: ["tumorsamplebarcode"],
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
                `MAF input is missing a required column for "${field}".`
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
 * @param {string} data
 * @param {{ columns?: string[] }} [format]
 */
export default function maf(data, format = {}) {
    const parsedRows = parseTsvRows(data, {
        ignorePrefixes: commentPrefixes,
    });

    if (parsedRows.length == 0) {
        return [];
    }

    const explicitColumns = format.columns;
    if (!explicitColumns && parsedRows.length < 2) {
        throw new Error(
            "MAF input must contain a header row and at least one data row when format.columns is not provided."
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

        const rawStart = parseIntegerOrNull(row[fieldIndexes.Start_Position]);
        const rawEnd = parseIntegerOrNull(row[fieldIndexes.End_Position]);

        datum.Hugo_Symbol = row[fieldIndexes.Hugo_Symbol];
        datum.Chromosome = row[fieldIndexes.Chromosome];
        datum.Start_Position = rawStart;
        datum.End_Position = rawEnd;
        datum.Reference_Allele = row[fieldIndexes.Reference_Allele];
        datum.Tumor_Seq_Allele2 = row[fieldIndexes.Tumor_Seq_Allele2];
        datum.Tumor_Sample_Barcode = row[fieldIndexes.Tumor_Sample_Barcode];

        // Canonical genome fields
        datum.chrom = datum.Chromosome;
        datum.start = rawStart === null || rawStart < 1 ? null : rawStart - 1;
        datum.end = rawEnd;
        datum.sample = datum.Tumor_Sample_Barcode;

        rows.push(datum);
    }

    return rows;
}
