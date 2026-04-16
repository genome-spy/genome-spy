import { faRobot } from "@fortawesome/free-solid-svg-icons";
import { getAgentMenuItems } from "./toolbarMenu.js";
import { getAgentState } from "./agentState.js";

/**
 * Registers agent-specific controls in the app shell.
 *
 * @param {import("../app.js").default} app
 * @returns {() => void}
 */
export function registerAgentUi(app) {
    if (!getAgentState(app).agentAdapter) {
        return () => {};
    }

    const removeButton = app.ui.registerToolbarButton({
        title: "Agent Chat",
        icon: faRobot,
        onClick: async () => {
            const { toggleAgentChatPanel } = await import("./chatPanel.js");
            await toggleAgentChatPanel(app);
        },
    });

    const removeMenuItems = getAgentMenuItems(app).map((item) =>
        app.ui.registerToolbarMenuItem(item)
    );

    return () => {
        removeButton();
        for (const removeMenuItem of removeMenuItems) {
            removeMenuItem();
        }
    };
}
