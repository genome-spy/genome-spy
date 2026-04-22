import { createAgentAdapter } from "./agentAdapter.js";
import { registerAgentUi } from "./agentUi.js";
import { getAgentState } from "./agentState.js";

/**
 * Creates the browser-side agent plugin.
 *
 * @param {{ baseUrl: string }} options
 * @returns {import("../appTypes.js").AppPlugin}
 */
export function appAgent(options) {
    if (!options.baseUrl) {
        throw new Error("appAgent requires a baseUrl");
    }

    return {
        name: "@genome-spy/app-agent",

        async install(app) {
            const appInstance = /** @type {import("../app.js").default} */ (
                app
            );
            const agentApi = await app.getAgentApi();
            const agentState = getAgentState(appInstance);

            agentState.agentBaseUrl = options.baseUrl;
            agentState.agentAdapter = createAgentAdapter(appInstance, agentApi);

            const disposeUi = registerAgentUi(appInstance);

            return () => {
                const state = getAgentState(appInstance);
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
