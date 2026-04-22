import { getSelectionAggregationContext } from "./selectionAggregationContext.js";

/**
 * @param {import("../agentApi/index.js").AgentApi} agentApi
 * @returns {import("./types.d.ts").AgentVolatileContext}
 */
export function getAgentVolatileContext(agentApi) {
    return {
        selectionAggregation: getSelectionAggregationContext(agentApi),
    };
}
