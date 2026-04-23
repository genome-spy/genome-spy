import { templateResultToString } from "@genome-spy/app/agentShared";
import { ToolCallRejectionError } from "./agentToolErrors.js";
import { resolveMetadataValueMatches } from "./metadataValueResolution.js";

const DEFAULT_MAX_RESULTS = 10;

/**
 * @typedef {import("./agentToolInputs.d.ts").ResolveMetadataAttributeValuesToolInput} ResolveMetadataAttributeValuesToolInput
 * @typedef {import("./types.d.ts").IntentBatchSummaryLine} IntentBatchSummaryLine
 * @typedef {{
 *     agentApi: import("@genome-spy/app/agentApi").AgentApi;
 * }} ResolveMetadataAttributeValuesToolRuntime
 * @typedef {{
 *     text: string;
 *     content?: unknown;
 *     summaries?: IntentBatchSummaryLine[];
 * }} AgentToolExecutionResult
 */

/**
 * Resolve a free-text metadata value against current visible categorical
 * sample metadata values.
 *
 * @param {ResolveMetadataAttributeValuesToolRuntime} runtime
 * @param {ResolveMetadataAttributeValuesToolInput} input
 * @returns {AgentToolExecutionResult}
 */
export function resolveMetadataAttributeValuesTool(runtime, input) {
    if (typeof input.query !== "string" || input.query.trim().length === 0) {
        throw new ToolCallRejectionError("Query must be a non-empty string.");
    }

    const sampleHierarchy = runtime.agentApi.getSampleHierarchy();
    if (!sampleHierarchy) {
        throw new ToolCallRejectionError(
            "The current visualization does not expose sample metadata."
        );
    }

    const matches = resolveMetadataValueMatches({
        sampleHierarchy,
        getAttributeInfo: runtime.agentApi.getAttributeInfo.bind(
            runtime.agentApi
        ),
        query: input.query,
        maxResults: DEFAULT_MAX_RESULTS,
    }).map((match) => ({
        ...match,
        title: templateResultToString(match.title),
    }));

    return {
        text:
            matches.length > 0
                ? `Resolved ${matches.length} metadata match${matches.length === 1 ? "" : "es"} for ${JSON.stringify(input.query)}.`
                : "No matching metadata values were found.",
        content: {
            kind: "metadata_attribute_value_resolution",
            query: input.query,
            count: matches.length,
            matches,
        },
    };
}
