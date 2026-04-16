import { getAgentState } from "./agentState.js";

/**
 * Initializes the agent runtime when it is enabled and configured.
 *
 * @param {import("../app.js").default} app
 * @param {import("./agentEmbedOptions.js").AgentEmbedOptions} options
 * @returns {Promise<void>}
 */
export async function setupAgentRuntime(app, options) {
    if (import.meta.env.VITE_AGENT_ENABLED !== "true") {
        return;
    }

    const agentBaseUrl =
        options.agentBaseUrl ??
        /** @type {string | undefined} */ (import.meta.env.VITE_AGENT_BASE_URL);

    if (!agentBaseUrl) {
        return;
    }

    const [agentAdapterModule, agentUiModule] = await Promise.all([
        import("./agentAdapter.js"),
        import("./agentUi.js"),
    ]);

    const agentState = getAgentState(app);
    agentState.agentBaseUrl = agentBaseUrl;
    agentState.agentAdapter = (
        options.agentAdapterFactory ?? agentAdapterModule.createAgentAdapter
    )(app);
    agentUiModule.registerAgentUi(app);
}
