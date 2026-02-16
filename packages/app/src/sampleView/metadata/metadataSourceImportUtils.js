import { MAX_METADATA_SOURCE_COLUMNS } from "./metadataSourceAdapters.js";

/**
 * @param {string} input
 * @returns {string[]}
 */
export function parseColumnQueries(input) {
    /** @type {string[]} */
    const queries = [];
    for (const line of input.split(/\r?\n/g)) {
        const value = line.trim();
        if (!value) {
            continue;
        }
        if (!queries.includes(value)) {
            queries.push(value);
        }
    }
    return queries;
}

/**
 * @param {{
 *   queries: string[];
 *   resolved: { columnIds: string[]; missing: string[]; ambiguous?: string[] };
 * }} params
 */
export function classifyImportReadiness({ queries, resolved }) {
    const ambiguous = resolved.ambiguous ?? [];
    const overLimit = resolved.columnIds.length > MAX_METADATA_SOURCE_COLUMNS;
    const hasResolvableColumns = resolved.columnIds.length > 0;

    return {
        queries,
        resolved,
        warnings: {
            missing: resolved.missing,
            ambiguous,
        },
        blocking: {
            emptyInput: queries.length === 0,
            noResolvableColumns: !hasResolvableColumns,
            overLimit,
        },
    };
}
