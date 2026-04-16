import { faEye } from "@fortawesome/free-solid-svg-icons";
import { getAgentState } from "./agentState.js";

/**
 * @param {import("../app.js").default} app
 * @param {Partial<{ isDev: boolean }>} [options]
 * @returns {import("../utils/ui/contextMenu.js").MenuItem[]}
 */
export function getAgentMenuItems(app, { isDev = import.meta.env.DEV } = {}) {
    if (!getAgentState(app).agentAdapter) {
        return [];
    }

    /** @type {import("../utils/ui/contextMenu.js").MenuItem[]} */
    const items = [];

    if (isDev) {
        items.push({
            label: "Show Agent Context",
            icon: faEye,
            callback: async () => {
                await showAgentContextDialog(app);
            },
        });
    }
    return items;
}

/**
 * @param {import("../app.js").default} app
 * @returns {Promise<void>}
 */
async function showAgentContextDialog(app) {
    const { showAgentContextDialog: openAgentContextDialog } =
        await import("../components/dialogs/agentContextDialog.js");
    await openAgentContextDialog(app);
}
