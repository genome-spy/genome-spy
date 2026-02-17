import { MAX_METADATA_SOURCE_COLUMNS } from "./metadataSourceAdapters.js";

/**
 * @typedef {import("@genome-spy/app/spec/sampleView.js").MetadataSourceDef} MetadataSourceDef
 */

/**
 * @param {MetadataSourceDef} source
 * @returns {false | "*" | string[]}
 */
export function getEffectiveInitialLoad(source) {
    if (source.initialLoad !== undefined) {
        return source.initialLoad;
    }

    return source.backend.backend === "data" ? "*" : false;
}

/**
 * @param {MetadataSourceDef} source
 * @param {{
 *   listColumns: (signal?: AbortSignal) => Promise<{ id: string }[]>;
 *   resolveColumns: (queries: string[], signal?: AbortSignal) => Promise<{ columnIds: string[] }>;
 * }} adapter
 * @param {AbortSignal} [signal]
 * @returns {Promise<string[]>}
 */
export async function resolveInitialLoadColumnIds(source, adapter, signal) {
    const initialLoad = getEffectiveInitialLoad(source);

    if (initialLoad === false) {
        return [];
    } else if (initialLoad === "*") {
        const columns = await adapter.listColumns(signal);
        return columns.map((column) => column.id);
    } else {
        const resolved = await adapter.resolveColumns(initialLoad, signal);
        return resolved.columnIds;
    }
}

/**
 * @param {string[]} columnIds
 * @returns {string[][]}
 */
export function chunkInitialLoadColumns(columnIds) {
    /** @type {string[][]} */
    const chunks = [];

    for (let i = 0; i < columnIds.length; i += MAX_METADATA_SOURCE_COLUMNS) {
        chunks.push(columnIds.slice(i, i + MAX_METADATA_SOURCE_COLUMNS));
    }

    return chunks;
}
