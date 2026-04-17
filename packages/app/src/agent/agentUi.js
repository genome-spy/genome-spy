import { faEye, faRobot } from "@fortawesome/free-solid-svg-icons";
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

    const removeMenuItem = import.meta.env.DEV
        ? app.ui.registerToolbarMenuItem({
              label: "Show Agent Context",
              icon: faEye,
              callback: async () => {
                  const { showAgentContextDialog } =
                      await import("../components/dialogs/agentContextDialog.js");
                  await showAgentContextDialog(app);
              },
          })
        : () => {};

    return () => {
        removeButton();
        removeMenuItem();
    };
}
