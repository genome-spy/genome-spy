import { createAgentAdapter } from "./agentAdapter.js";
import { registerAgentUi } from "./agentUi.js";
import { getAgentState } from "./agentState.js";

/**
 * Creates the browser-side agent plugin.
 *
 * @param {{ baseUrl: string }} options
 */
export function appAgent(options) {
    if (!options.baseUrl) {
        throw new Error("appAgent requires a baseUrl");
    }

    return {
        name: "@genome-spy/app-agent",

        async install(/** @type {any} */ app) {
            const agentApi = await app.getAgentApi();
            const agentState = getAgentState(app);

            agentState.agentBaseUrl = options.baseUrl;
            agentState.agentAdapter = createAgentAdapter(app, agentApi);

            const disposeUi = registerAgentUi(app);

            return () => {
                const state = getAgentState(app);
                state.agentSessionController?.stopCurrentTurn?.();
                state.agentSessionController = undefined;
                state.agentAdapter = undefined;
                state.agentBaseUrl = undefined;
                state.agentChatPanelHost?.remove();
                state.agentChatPanelHost = undefined;
                disposeUi();
            };
        },
    };
}
