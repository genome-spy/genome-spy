import { ToolCallRejectionError } from "./agentToolErrors.js";

const DEFAULT_MAX_CATEGORIES = 15;
const categoryCollator = new Intl.Collator("en", {
    numeric: true,
    sensitivity: "base",
});

/**
 * @typedef {import("./agentToolInputs.d.ts").GetMetadataAttributeSummaryToolInput} GetMetadataAttributeSummaryToolInput
 * @typedef {import("../sampleView/types.d.ts").AttributeIdentifier} AttributeIdentifier
 * @typedef {import("./types.d.ts").AgentMetadataAttributeSummarySource} AgentMetadataAttributeSummarySource
 * @typedef {import("./types.d.ts").IntentBatchSummaryLine} IntentBatchSummaryLine
 * @typedef {{
 *     getMetadataAttributeSummarySource(
 *         attribute: AttributeIdentifier
 *     ): AgentMetadataAttributeSummarySource | undefined;
 * }} MetadataAttributeSummaryToolRuntime
 * @typedef {{
 *     text: string;
 *     content?: unknown;
 *     summaries?: IntentBatchSummaryLine[];
 * }} AgentToolExecutionResult
 */

/**
 * Returns a compact summary of one metadata attribute's current values.
 *
 * @param {MetadataAttributeSummaryToolRuntime} runtime
 * @param {GetMetadataAttributeSummaryToolInput} input
 * @returns {AgentToolExecutionResult}
 */
export function getMetadataAttributeSummaryTool(runtime, input) {
    if (!input.attribute || typeof input.attribute !== "object") {
        throw new ToolCallRejectionError(
            "Attribute must be a metadata AttributeIdentifier object."
        );
    }

    if (input.attribute.type !== "SAMPLE_ATTRIBUTE") {
        throw new ToolCallRejectionError(
            "Only SAMPLE_ATTRIBUTE identifiers are supported by this tool."
        );
    }

    if (typeof input.attribute.specifier !== "string") {
        throw new ToolCallRejectionError(
            "Metadata attribute specifier must be a string."
        );
    }

    const source = runtime.getMetadataAttributeSummarySource(input.attribute);
    if (!source) {
        throw new ToolCallRejectionError(
            "The requested metadata attribute was not found in the current sample view."
        );
    }

    const content =
        source.dataType === "quantitative"
            ? buildQuantitativeSummary(source)
            : buildCategoricalSummary(source);

    return {
        text: buildSummaryText(content),
        content,
    };
}

/**
 * @param {AgentMetadataAttributeSummarySource} source
 */
function buildQuantitativeSummary(source) {
    let nonMissingCount = 0;
    let missingCount = 0;
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;

    for (const value of source.values) {
        const numericValue = coerceNumericValue(value);
        if (numericValue === undefined) {
            missingCount++;
            continue;
        }

        nonMissingCount++;
        min = Math.min(min, numericValue);
        max = Math.max(max, numericValue);
        sum += numericValue;
    }

    return {
        kind: "metadata_attribute_summary",
        attribute: source.attribute,
        title: source.title,
        ...(source.description ? { description: source.description } : {}),
        dataType: source.dataType,
        scope: "all_samples",
        sampleCount: source.sampleIds.length,
        nonMissingCount,
        missingCount,
        ...(nonMissingCount > 0
            ? {
                  min,
                  max,
                  mean: sum / nonMissingCount,
              }
            : {}),
    };
}

/**
 * @param {AgentMetadataAttributeSummarySource} source
 */
function buildCategoricalSummary(source) {
    /** @type {Map<unknown, number>} */
    const counts = new Map();
    let nonMissingCount = 0;
    let missingCount = 0;

    for (const value of source.values) {
        if (isMissingValue(value)) {
            missingCount++;
            continue;
        }

        nonMissingCount++;
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    const categories = Array.from(counts.entries())
        .sort(compareCategoryEntries)
        .slice(0, DEFAULT_MAX_CATEGORIES)
        .map(([value, count]) => ({
            value,
            count,
        }));

    return {
        kind: "metadata_attribute_summary",
        attribute: source.attribute,
        title: source.title,
        ...(source.description ? { description: source.description } : {}),
        dataType: source.dataType,
        scope: "all_samples",
        sampleCount: source.sampleIds.length,
        nonMissingCount,
        missingCount,
        distinctCount: counts.size,
        categories,
        truncated: counts.size > DEFAULT_MAX_CATEGORIES,
    };
}

/**
 * @param {ReturnType<typeof buildQuantitativeSummary> | ReturnType<typeof buildCategoricalSummary>} content
 * @returns {string}
 */
function buildSummaryText(content) {
    if (content.dataType === "quantitative") {
        return `Summarized metadata attribute ${content.title} across ${content.nonMissingCount} non-missing samples.`;
    }

    if ("distinctCount" in content) {
        return `Summarized metadata attribute ${content.title} with ${content.distinctCount} observed categories.`;
    }

    throw new Error("Categorical metadata summary is missing distinctCount.");
}

/**
 * @param {[unknown, number]} a
 * @param {[unknown, number]} b
 * @returns {number}
 */
function compareCategoryEntries(a, b) {
    if (b[1] !== a[1]) {
        return b[1] - a[1];
    }

    return categoryCollator.compare(String(a[0]), String(b[0]));
}

/**
 * @param {unknown} value
 * @returns {number | undefined}
 */
function coerceNumericValue(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : undefined;
    }

    if (typeof value === "string" && value.trim() !== "") {
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue : undefined;
    }

    return undefined;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isMissingValue(value) {
    return (
        value === null ||
        value === undefined ||
        (typeof value === "number" && Number.isNaN(value))
    );
}
