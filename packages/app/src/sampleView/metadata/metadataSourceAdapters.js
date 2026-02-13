import DataMetadataSourceAdapter from "./adapters/dataMetadataSourceAdapter.js";

/**
 * @typedef {import("@genome-spy/app/spec/sampleView.js").SampleDef} SampleDef
 * @typedef {import("@genome-spy/app/spec/sampleView.js").MetadataSourceDef} MetadataSourceDef
 */

export const MAX_METADATA_SOURCE_COLUMNS = 100;

/**
 * @param {SampleDef} sampleDef
 * @returns {MetadataSourceDef[]}
 */
function getInlineSources(sampleDef) {
    const entries = sampleDef.metadataSources ?? [];

    /** @type {MetadataSourceDef[]} */
    const sources = [];
    for (const entry of entries) {
        if ("import" in entry) {
            throw new Error(
                "Imported metadata sources are not yet supported in metadata source actions."
            );
        }
        sources.push(entry);
    }

    return sources;
}

/**
 * @param {SampleDef} sampleDef
 * @param {string | undefined} sourceId
 * @returns {MetadataSourceDef}
 */
export function resolveMetadataSource(sampleDef, sourceId) {
    const sources = getInlineSources(sampleDef);

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

    throw new Error(
        'Metadata backend "' +
            source.backend.backend +
            '" is not implemented yet.'
    );
}
