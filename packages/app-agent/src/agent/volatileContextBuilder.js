import { getSelectionAggregationContext } from "./selectionAggregationContext.js";

/**
 * @param {import("@genome-spy/app/agentApi").AgentApi} agentApi
 * @returns {import("./types.d.ts").AgentVolatileContext}
 */
export function getAgentVolatileContext(agentApi) {
    return {
        selectionAggregation: getSelectionAggregationContext(agentApi),
    };
}
