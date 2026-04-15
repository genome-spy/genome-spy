import { ToolCallRejectionError } from "./agentToolErrors.js";
import {
    buildCategoricalFieldSummary,
    buildQuantitativeFieldSummary,
} from "./metadataSummaryReducers.js";

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
    return {
        kind: "metadata_attribute_summary",
        attribute: source.attribute,
        title: source.title,
        ...(source.description ? { description: source.description } : {}),
        dataType: source.dataType,
        scope: source.scope,
        sampleCount: source.sampleIds.length,
        ...buildQuantitativeFieldSummary(source.values),
    };
}

/**
 * @param {AgentMetadataAttributeSummarySource} source
 */
function buildCategoricalSummary(source) {
    return {
        kind: "metadata_attribute_summary",
        attribute: source.attribute,
        title: source.title,
        ...(source.description ? { description: source.description } : {}),
        dataType: source.dataType,
        scope: source.scope,
        sampleCount: source.sampleIds.length,
        ...buildCategoricalFieldSummary(source.values),
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
