/**
 * @typedef {import("@genome-spy/app/spec/sampleView.js").MetadataSourceDef} MetadataSourceDef
 * @typedef {import("@genome-spy/core/spec/data.js").Data} Data
 * @typedef {import("@genome-spy/core/spec/data.js").InlineData} InlineData
 * @typedef {import("@genome-spy/core/spec/data.js").UrlData} UrlData
 */

export const LEGACY_SAMPLE_METADATA_DEPRECATION_WARNING =
    "The samples.data, samples.attributeGroupSeparator, and samples.attributes properties are deprecated. Use samples.metadataSources instead.";

/**
 * @param {Record<string, unknown>} sampleDef
 * @returns {boolean}
 */
function hasLegacyMetadataFields(sampleDef) {
    return (
        sampleDef.data !== undefined ||
        sampleDef.attributeGroupSeparator !== undefined ||
        sampleDef.attributes !== undefined
    );
}

/**
 * @param {Data} data
 * @returns {data is UrlData | InlineData}
 */
function isUrlOrInlineData(data) {
    return (
        data !== null &&
        typeof data === "object" &&
        ("url" in data || "values" in data)
    );
}

/**
 * Normalizes sample metadata source configuration and preserves legacy behavior.
 *
 * @param {Record<string, unknown>} sampleDef
 * @returns {{ sampleDef: Record<string, unknown>; usesLegacyMetadata: boolean }}
 */
export function normalizeSampleDefMetadataSources(sampleDef) {
    const usesLegacyMetadata = hasLegacyMetadataFields(sampleDef);

    if (sampleDef.metadataSources && usesLegacyMetadata) {
        throw new Error(
            "Cannot combine legacy sample metadata fields (samples.data, samples.attributeGroupSeparator, samples.attributes) with samples.metadataSources. Use samples.metadataSources only."
        );
    }

    if (sampleDef.metadataSources || sampleDef.data === undefined) {
        return { sampleDef, usesLegacyMetadata };
    }

    const data = /** @type {Data} */ (sampleDef.data);
    if (!isUrlOrInlineData(data)) {
        throw new Error(
            "Legacy samples.data must be UrlData or InlineData when mapping to metadataSources."
        );
    }

    /** @type {MetadataSourceDef} */
    const metadataSource = {
        initialLoad: "*",
        excludeColumns: ["displayName"],
        backend: {
            backend: "data",
            data,
            sampleIdField: "sample",
        },
    };

    if (sampleDef.attributeGroupSeparator !== undefined) {
        metadataSource.attributeGroupSeparator = /** @type {string} */ (
            sampleDef.attributeGroupSeparator
        );
    }

    if (sampleDef.attributes !== undefined) {
        metadataSource.attributes =
            /** @type {Record<string, import("@genome-spy/app/spec/sampleView.js").SampleAttributeDef>} */ (
                sampleDef.attributes
            );
    }

    return {
        sampleDef: {
            ...sampleDef,
            identity: sampleDef.identity ?? {
                data,
                idField: "sample",
                displayNameField: "displayName",
            },
            metadataSources: [metadataSource],
        },
        usesLegacyMetadata,
    };
}
