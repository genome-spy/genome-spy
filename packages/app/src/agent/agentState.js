/**
 * Agent-specific state attached to an App instance.
 *
 * @typedef {{
 *     agentBaseUrl?: string;
 *     agentAdapter?: import("./types.js").AgentAdapter;
 *     agentSessionController?: import("./agentSessionController.js").AgentSessionController;
 * }} AgentState
 */

const agentStates = new WeakMap();

/**
 * @param {import("../app.js").default} app
 * @returns {AgentState}
 */
export function getAgentState(app) {
    let state = agentStates.get(app);
    if (!state) {
        state = {};
        agentStates.set(app, state);
    }

    return state;
}
