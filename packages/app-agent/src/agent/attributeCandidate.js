import { buildSelectionAggregationAttribute } from "./selectionAggregationTool.js";
import { ToolCallRejectionError } from "./agentToolErrors.js";

/**
 * Resolves a compact agent-facing attribute candidate into the canonical app
 * AttributeIdentifier shape.
 *
 * @param {{
 *     getAgentVolatileContext(): import("./types.d.ts").AgentVolatileContext;
 *     agentApi?: Pick<import("@genome-spy/app/agentApi").AgentApi, "materializeAttributeIdentifier">;
 * }} runtime
 * @param {import("./agentToolInputs.d.ts").AgentAttributeCandidate} candidate
 * @returns {import("@genome-spy/app/agentShared").AttributeIdentifier}
 */
export function resolveAgentAttributeCandidate(runtime, candidate) {
    return resolveAgentAttributeCandidateRecord(runtime, candidate).normalized;
}

/**
 * Resolves a compact agent-facing attribute candidate and features the input
 * basis for later turns.
 *
 * @param {{
 *     getAgentVolatileContext(): import("./types.d.ts").AgentVolatileContext;
 *     agentApi?: Pick<import("@genome-spy/app/agentApi").AgentApi, "materializeAttributeIdentifier">;
 * }} runtime
 * @param {import("./agentToolInputs.d.ts").AgentAttributeCandidate} candidate
 * @returns {{
 *     input: import("./agentToolInputs.d.ts").AgentAttributeCandidate;
 *     normalized: import("@genome-spy/app/agentShared").AttributeIdentifier;
 *     plotAttribute: import("@genome-spy/app/agentShared").AttributeIdentifier;
 * }}
 */
export function resolveAgentAttributeCandidateRecord(runtime, candidate) {
    if (candidate.type === "SAMPLE_ATTRIBUTE") {
        /** @type {import("@genome-spy/app/agentShared").AttributeIdentifier} */
        const resolved = {
            type: "SAMPLE_ATTRIBUTE",
            specifier: candidate.specifier,
        };

        return {
            input: candidate,
            normalized: resolved,
            plotAttribute: resolved,
        };
    }

    if (candidate.type === "SELECTION_AGGREGATION") {
        const volatileContext = runtime.getAgentVolatileContext();
        const resolution = buildSelectionAggregationAttribute(
            volatileContext,
            candidate.candidateId,
            candidate.aggregation,
            "featureFilter" in candidate ? candidate.featureFilter : undefined
        );
        const plotAttribute = materializeAttributeIdentifier(
            runtime,
            resolution.attribute
        );
        const normalized = structuredClone(resolution.attribute);

        return {
            input: candidate,
            normalized,
            plotAttribute,
        };
    }

    throw new ToolCallRejectionError("Unsupported attribute candidate type.");
}

/**
 * @param {{
 *     agentApi?: Pick<import("@genome-spy/app/agentApi").AgentApi, "materializeAttributeIdentifier">;
 * }} runtime
 * @param {import("@genome-spy/app/agentShared").AttributeIdentifier} attribute
 * @returns {import("@genome-spy/app/agentShared").AttributeIdentifier}
 */
function materializeAttributeIdentifier(runtime, attribute) {
    return runtime.agentApi?.materializeAttributeIdentifier
        ? runtime.agentApi.materializeAttributeIdentifier(attribute)
        : attribute;
}
