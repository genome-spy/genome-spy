import { buildSelectionAggregationAttribute } from "./selectionAggregationTool.js";
import { ToolCallRejectionError } from "./agentToolErrors.js";

/**
 * Resolves a compact agent-facing attribute candidate into the canonical app
 * AttributeIdentifier shape.
 *
 * @param {{
 *     getAgentVolatileContext(): import("./types.js").AgentVolatileContext;
 * }} runtime
 * @param {import("./agentToolInputs.d.ts").AgentAttributeCandidate} candidate
 * @returns {import("@genome-spy/app/agentShared").AttributeIdentifier}
 */
export function resolveAgentAttributeCandidate(runtime, candidate) {
    if (candidate.type === "SAMPLE_ATTRIBUTE") {
        return {
            type: "SAMPLE_ATTRIBUTE",
            specifier: candidate.specifier,
        };
    }

    if (candidate.type === "SELECTION_AGGREGATION") {
        return buildSelectionAggregationAttribute(
            runtime.getAgentVolatileContext(),
            candidate.candidateId,
            candidate.aggregation
        ).attribute;
    }

    throw new ToolCallRejectionError("Unsupported attribute candidate type.");
}
