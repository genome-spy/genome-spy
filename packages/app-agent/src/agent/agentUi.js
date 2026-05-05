import { faEye, faRobot, faTrash, faVial } from "@fortawesome/free-solid-svg-icons";
import { getAgentState } from "./agentState.js";

/**
 * Registers agent-specific controls in the app shell.
 *
 * @param {any} app
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

    const removeVolatileContextMenuItem = import.meta.env.DEV
        ? app.ui.registerToolbarMenuItem({
              label: "Show Volatile Context",
              icon: faVial,
              callback: async () => {
                  const { showAgentVolatileContextDialog } = await import(
                      "../components/dialogs/volatileContextDialog.js"
                  );
                  await showAgentVolatileContextDialog(app);
              },
          })
        : () => {};

    const clearChatHistoryMenuItem = app.ui.registerToolbarMenuItem({
        label: "Clear chat history",
        icon: faTrash,
        callback: async () => {
            const { clearAgentChatHistory } = await import("./chatPanel.js");
            clearAgentChatHistory(app);
        },
    });

    return () => {
        removeButton();
        removeMenuItem();
        removeVolatileContextMenuItem();
        clearChatHistoryMenuItem();
    };
}
