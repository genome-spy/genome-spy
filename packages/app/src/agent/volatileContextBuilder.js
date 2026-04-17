import { getSelectionAggregationContext } from "./selectionAggregationContext.js";

/**
 * @param {import("../app.js").default} app
 * @returns {import("./types.d.ts").AgentVolatileContext}
 */
export function getAgentVolatileContext(app) {
    return {
        selectionAggregation: getSelectionAggregationContext(app),
    };
}
