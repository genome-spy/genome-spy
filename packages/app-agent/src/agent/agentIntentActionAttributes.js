// @ts-check
import { resolveAgentAttributeCandidate } from "./attributeCandidate.js";

/**
 * Resolves agent-facing selection aggregation candidates inside intent action
 * payloads into the canonical AttributeIdentifier shape expected by reducers.
 *
 * @param {{
 *     getAgentVolatileContext(): import("./types.d.ts").AgentVolatileContext;
 *     agentApi?: Pick<import("@genome-spy/app/agentApi").AgentApi, "materializeAttributeIdentifier">;
 * }} runtime
 * @param {unknown} value
 * @returns {unknown}
 */
export function normalizeAgentIntentActionAttributes(runtime, value) {
    if (Array.isArray(value)) {
        return value.map((item) =>
            normalizeAgentIntentActionAttributes(runtime, item)
        );
    }

    if (!isObject(value)) {
        return value;
    }

    if (isSelectionAggregationCandidate(value)) {
        return resolveAgentAttributeCandidate(runtime, value);
    }

    return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
            key,
            normalizeAgentIntentActionAttributes(runtime, child),
        ])
    );
}

/**
 * @param {Record<string, any>} value
 * @returns {value is import("./agentToolInputs.d.ts").SelectionAggregationCandidate}
 */
function isSelectionAggregationCandidate(value) {
    return (
        value.type === "SELECTION_AGGREGATION" &&
        typeof value.candidateId === "string" &&
        typeof value.aggregation === "string"
    );
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
