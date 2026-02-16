import { resolveUrl } from "@genome-spy/core/utils/url.js";
import DataMetadataSourceAdapter from "./adapters/dataMetadataSourceAdapter.js";
import ZarrMetadataSourceAdapter from "./adapters/zarrMetadataSourceAdapter.js";

/**
 * @typedef {import("@genome-spy/app/spec/sampleView.js").SampleDef} SampleDef
 * @typedef {import("@genome-spy/app/spec/sampleView.js").MetadataSourceDef} MetadataSourceDef
 * @typedef {import("@genome-spy/app/spec/sampleView.js").MetadataSourceEntry} MetadataSourceEntry
 */

export const MAX_METADATA_SOURCE_COLUMNS = 100;

/**
 * @typedef {object} MetadataSourceResolveOptions
 * @property {string} [baseUrl]
 * @property {AbortSignal} [signal]
 * @property {(url: string, signal?: AbortSignal) => Promise<unknown>} [loadJson]
 */

/**
 * @param {string} url
 * @param {AbortSignal} [signal]
 * @returns {Promise<unknown>}
 */
async function defaultLoadJson(url, signal) {
    let response;
    try {
        response = await fetch(url, { signal });
    } catch (error) {
        throw new Error(
            "Could not load metadata source import from " +
                url +
                ": " +
                String(error)
        );
    }

    if (!response.ok) {
        throw new Error(
            "Could not load metadata source import from " +
                url +
                ": " +
                String(response.status) +
                " " +
                response.statusText
        );
    }

    try {
        return await response.json();
    } catch (error) {
        throw new Error(
            "Invalid JSON in metadata source import " +
                url +
                ": " +
                String(error)
        );
    }
}

/**
 * @param {unknown} source
 * @param {string} importUrl
 * @returns {MetadataSourceDef}
 */
function asMetadataSourceDef(source, importUrl) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
        throw new Error(
            "Metadata source import " +
                importUrl +
                " must resolve to a single source object."
        );
    } else if ("import" in source) {
        throw new Error(
            "Nested metadata source imports are not supported: " + importUrl
        );
    } else if (!("backend" in source)) {
        throw new Error(
            'Metadata source import "' +
                importUrl +
                '" is missing required property "backend".'
        );
    } else {
        return /** @type {MetadataSourceDef} */ (source);
    }
}

/**
 * Rewrites backend URLs so they remain relative to the import file.
 *
 * @param {MetadataSourceDef} source
 * @param {string} importUrl
 * @returns {MetadataSourceDef}
 */
function resolveImportedBackendUrls(source, importUrl) {
    if (source.backend.backend === "data") {
        const data = source.backend.data;
        if (
            data &&
            typeof data === "object" &&
            !Array.isArray(data) &&
            "url" in data &&
            typeof data.url === "string"
        ) {
            return {
                ...source,
                backend: {
                    ...source.backend,
                    data: {
                        ...data,
                        url: resolveUrl(importUrl, data.url),
                    },
                },
            };
        }
        return source;
    }

    if ("url" in source.backend && typeof source.backend.url === "string") {
        return {
            ...source,
            backend: {
                ...source.backend,
                url: resolveUrl(importUrl, source.backend.url),
            },
        };
    }

    return source;
}

/**
 * @param {SampleDef} sampleDef
 * @param {MetadataSourceResolveOptions} [options]
 * @returns {Promise<MetadataSourceDef[]>}
 */
export async function resolveMetadataSources(sampleDef, options = {}) {
    const entries = /** @type {MetadataSourceEntry[]} */ (
        sampleDef.metadataSources ?? []
    );
    const loadJson = options.loadJson ?? defaultLoadJson;

    return Promise.all(
        entries.map(async (entry) => {
            if (!("import" in entry)) {
                return entry;
            }

            const importUrl = resolveUrl(options.baseUrl, entry.import.url);
            const imported = await loadJson(importUrl, options.signal);
            const source = asMetadataSourceDef(imported, importUrl);
            return resolveImportedBackendUrls(source, importUrl);
        })
    );
}

/**
 * @param {SampleDef} sampleDef
 * @param {string | undefined} sourceId
 * @param {MetadataSourceResolveOptions} [options]
 * @returns {Promise<MetadataSourceDef>}
 */
export async function resolveMetadataSource(sampleDef, sourceId, options) {
    const sources = await resolveMetadataSources(sampleDef, options);

    if (sources.length === 0) {
        throw new Error("No metadata sources are configured.");
    }

    if (sourceId !== undefined) {
        const matched = sources.find((source) => source.id === sourceId);
        if (!matched) {
            throw new Error(
                'Metadata source "' + sourceId + '" was not found.'
            );
        }
        return matched;
    }

    if (sources.length !== 1) {
        throw new Error(
            "Metadata source id is required when multiple sources are configured."
        );
    }

    return sources[0];
}

/**
 * @param {MetadataSourceDef} source
 * @param {{ baseUrl?: string }} [options]
 */
export function createMetadataSourceAdapter(source, options = {}) {
    if (source.backend.backend === "data") {
        return new DataMetadataSourceAdapter(source, options);
    }

    if (source.backend.backend === "zarr") {
        return new ZarrMetadataSourceAdapter(source, options);
    }

    throw new Error(
        'Metadata backend "' +
            source.backend.backend +
            '" is not implemented yet.'
    );
}
