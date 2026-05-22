// @ts-check

/**
 * @typedef {import("@genome-spy/app/spec/sampleView.js").SampleSpec} SampleSpec
 * @typedef {import("@genome-spy/app/spec/sampleView.js").MetadataSourceDef} MetadataSourceDef
 * @typedef {import("@genome-spy/core/spec/data.js").Data} Data
 * @typedef {import("@genome-spy/core/spec/data.js").InlineData} InlineData
 * @typedef {import("@genome-spy/core/spec/data.js").UrlData} UrlData
 */

const LEGACY_SAMPLE_METADATA_FIELDS =
    "samples.data, samples.attributeGroupSeparator, and samples.attributes";

export const LEGACY_SAMPLE_METADATA_WARNING =
    "The " +
    LEGACY_SAMPLE_METADATA_FIELDS +
    " properties are deprecated. Use metadata.sources instead.";

export const TRANSITIONAL_METADATA_SOURCES_WARNING =
    "samples.metadataSources is deprecated. Use metadata.sources instead.";

export const LEGACY_METADATA_LAYOUT_WARNING =
    "Metadata layout properties under samples are deprecated. Use metadata layout properties instead.";

export const LEGACY_LABEL_TITLE_TEXT_WARNING =
    "samples.labelTitleText is deprecated. Use samples.labelTitle instead.";

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
 * @param {Record<string, unknown>} sampleDef
 * @returns {Record<string, unknown>}
 */
function extractLegacyMetadataLayout(sampleDef) {
    /** @type {Record<string, unknown>} */
    const metadataLayout = {};

    if (sampleDef.attributeSize !== undefined) {
        metadataLayout.attributeWidth = sampleDef.attributeSize;
    }
    if (sampleDef.attributeSpacing !== undefined) {
        metadataLayout.spacing = sampleDef.attributeSpacing;
    }
    if (sampleDef.attributeLabelFont !== undefined) {
        metadataLayout.labelFont = sampleDef.attributeLabelFont;
    }
    if (sampleDef.attributeLabelFontSize !== undefined) {
        metadataLayout.labelFontSize = sampleDef.attributeLabelFontSize;
    }
    if (sampleDef.attributeLabelFontStyle !== undefined) {
        metadataLayout.labelFontStyle = sampleDef.attributeLabelFontStyle;
    }
    if (sampleDef.attributeLabelFontWeight !== undefined) {
        metadataLayout.labelFontWeight = sampleDef.attributeLabelFontWeight;
    }
    if (sampleDef.attributeLabelAngle !== undefined) {
        metadataLayout.labelAngle =
            -90 + /** @type {number} */ (sampleDef.attributeLabelAngle);
    }

    return metadataLayout;
}

/**
 * @param {Record<string, unknown>} sampleDef
 * @returns {MetadataSourceDef}
 */
function createLegacyMetadataSource(sampleDef) {
    const data = /** @type {Data} */ (sampleDef.data);
    if (!isUrlOrInlineData(data)) {
        throw new Error(
            "Legacy samples.data must be UrlData or InlineData when mapping to metadata.sources."
        );
    }

    /** @type {MetadataSourceDef} */
    const source = {
        initialLoad: "*",
        excludeColumns: ["displayName"],
        backend: {
            backend: "data",
            data,
            sampleIdField: "sample",
        },
    };

    if (sampleDef.attributeGroupSeparator !== undefined) {
        source.attributeGroupSeparator = /** @type {string} */ (
            sampleDef.attributeGroupSeparator
        );
    }
    if (sampleDef.attributes !== undefined) {
        source.attributes =
            /** @type {Record<string, import("@genome-spy/app/spec/sampleView.js").SampleAttributeDef>} */ (
                sampleDef.attributes
            );
    }

    return source;
}

/**
 * @param {SampleSpec} spec
 * @returns {{ spec: SampleSpec; warnings: string[] }}
 */
export function normalizeSampleViewSpec(spec) {
    const sampleDef = /** @type {Record<string, unknown>} */ (
        spec.samples ?? {}
    );
    const metadataDef = /** @type {Record<string, unknown>} */ (
        spec.metadata ?? {}
    );
    /** @type {string[]} */
    const warnings = [];

    const hasCanonicalSources = metadataDef.sources !== undefined;
    const hasTransitionalSources = sampleDef.metadataSources !== undefined;
    const hasLegacyMetadata = hasLegacyMetadataFields(sampleDef);

    if (hasCanonicalSources && hasTransitionalSources) {
        throw new Error(
            "Cannot combine metadata.sources with samples.metadataSources. Use metadata.sources only."
        );
    }
    if (hasCanonicalSources && hasLegacyMetadata) {
        throw new Error(
            "Cannot combine metadata.sources with legacy sample metadata fields (" +
                LEGACY_SAMPLE_METADATA_FIELDS +
                "). Use metadata.sources only."
        );
    }
    if (hasTransitionalSources && hasLegacyMetadata) {
        throw new Error(
            "Cannot combine samples.metadataSources with legacy sample metadata fields (" +
                LEGACY_SAMPLE_METADATA_FIELDS +
                "). Use metadata.sources only."
        );
    }

    const legacyMetadataLayout = extractLegacyMetadataLayout(sampleDef);
    const hasLegacyMetadataLayout =
        Object.keys(legacyMetadataLayout).length > 0;

    /** @type {Record<string, unknown>} */
    const normalizedSamples = { ...sampleDef };
    /** @type {Record<string, unknown>} */
    const normalizedMetadata = { ...metadataDef };
    let changed = false;

    if (
        sampleDef.labelTitleText !== undefined &&
        sampleDef.labelTitle === undefined
    ) {
        normalizedSamples.labelTitle = sampleDef.labelTitleText;
        changed = true;
        warnings.push(LEGACY_LABEL_TITLE_TEXT_WARNING);
    }

    if (hasLegacyMetadata) {
        normalizedSamples.identity = sampleDef.identity ?? {
            data: sampleDef.data,
            idField: "sample",
            displayNameField: "displayName",
        };
        normalizedMetadata.sources = [createLegacyMetadataSource(sampleDef)];
        changed = true;
        warnings.push(LEGACY_SAMPLE_METADATA_WARNING);
    } else if (hasTransitionalSources) {
        normalizedMetadata.sources = sampleDef.metadataSources;
        changed = true;
        warnings.push(TRANSITIONAL_METADATA_SOURCES_WARNING);
    }

    if (hasLegacyMetadataLayout) {
        Object.assign(normalizedMetadata, legacyMetadataLayout, metadataDef);
        changed = true;
        warnings.push(LEGACY_METADATA_LAYOUT_WARNING);
    }

    if (!changed) {
        return { spec, warnings };
    }

    return {
        spec: /** @type {SampleSpec} */ ({
            ...spec,
            samples: normalizedSamples,
            metadata: normalizedMetadata,
        }),
        warnings,
    };
}
