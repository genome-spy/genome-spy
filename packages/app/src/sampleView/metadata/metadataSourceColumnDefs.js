import {
    METADATA_PATH_SEPARATOR,
    replacePathSeparator,
} from "./metadataUtils.js";
import { joinPathParts, splitPath } from "../../utils/escapeSeparator.js";

/**
 * @typedef {import("@genome-spy/app/spec/sampleView.js").MetadataSourceDef} MetadataSourceDef
 * @typedef {import("@genome-spy/app/spec/sampleView.js").SampleAttributeDef} SampleAttributeDef
 */

/**
 * @param {string} key
 * @param {string | undefined} separator
 * @returns {string}
 */
function toInternalPath(key, separator) {
    if (!separator) {
        return key;
    } else {
        return replacePathSeparator(key, separator, METADATA_PATH_SEPARATOR);
    }
}

/**
 * Resolves applicable `columnDefs` for the imported columns.
 *
 * Includes both leaf column definitions and relevant ancestor group
 * definitions (for hierarchical inheritance).
 *
 * @param {MetadataSourceDef} source
 * @param {string[]} columnIds
 * @returns {Record<string, SampleAttributeDef>}
 */
export function resolveMetadataSourceColumnDefs(source, columnIds) {
    const rawColumnDefs = source.columnDefs;
    if (!rawColumnDefs) {
        return {};
    }

    const separator = source.attributeGroupSeparator;
    /** @type {Set<string>} */
    const eligiblePaths = new Set();

    for (const columnId of columnIds) {
        const internalPath = toInternalPath(columnId, separator);
        const parts = splitPath(internalPath, METADATA_PATH_SEPARATOR);
        for (let i = 1; i <= parts.length; i++) {
            eligiblePaths.add(
                joinPathParts(parts.slice(0, i), METADATA_PATH_SEPARATOR)
            );
        }
    }
    eligiblePaths.add("");

    /** @type {Record<string, SampleAttributeDef>} */
    const resolved = {};
    /** @type {Map<string, string>} */
    const pathOrigin = new Map();

    for (const [rawPath, rawDef] of Object.entries(rawColumnDefs)) {
        const internalPath = toInternalPath(rawPath, separator);
        if (!eligiblePaths.has(internalPath)) {
            continue;
        }

        const existingOrigin = pathOrigin.get(internalPath);
        if (existingOrigin) {
            throw new Error(
                'Metadata source columnDefs has conflicting keys "' +
                    existingOrigin +
                    '" and "' +
                    rawPath +
                    '" that both resolve to "' +
                    internalPath +
                    '".'
            );
        }
        pathOrigin.set(internalPath, rawPath);
        resolved[internalPath] = { ...rawDef };
    }

    return resolved;
}
