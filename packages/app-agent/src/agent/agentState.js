/**
 * Agent-specific state attached to an App instance.
 *
 * @typedef {{
 *     agentBaseUrl?: string;
 *     agentAdapter?: import("./types.js").AgentAdapter;
 *     agentSessionController?: import("./agentSessionController.js").AgentSessionController;
 *     agentChatPanelHost?: HTMLElement;
 *     agentChatPanelHandle?: {
 *         show(): void;
 *         hide(): void;
 *         toggle(): boolean;
 *         isVisible(): boolean;
 *         dispose(): void;
 *     };
 * }} AgentState
 */

const agentStates = new WeakMap();

/**
 * @param {object} app
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
