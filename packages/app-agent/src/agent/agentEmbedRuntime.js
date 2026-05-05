import { appAgent } from "./appAgent.js";

/**
 * Initializes the agent runtime when it is configured.
 *
 * @param {object} app
 * @param {import("./agentEmbedOptions.js").AgentEmbedOptions} options
 * @returns {Promise<void>}
 */
export async function setupAgentRuntime(app, options) {
    const agentBaseUrl =
        options.agentBaseUrl ??
        /** @type {string | undefined} */ (import.meta.env.VITE_AGENT_BASE_URL);

    if (!agentBaseUrl) {
        return;
    }

    await appAgent({ baseUrl: agentBaseUrl }).install(app);
}
