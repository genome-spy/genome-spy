import { faEye, faStopwatch } from "@fortawesome/free-solid-svg-icons";

/**
 * @param {import("../app.js").default} app
 * @param {Partial<{ isDev: boolean }>} [options]
 * @returns {import("../utils/ui/contextMenu.js").MenuItem[]}
 */
export function getAgentMenuItems(app, { isDev = import.meta.env.DEV } = {}) {
    if (!app.options.showLocalAgentButton || !app.agentAdapter) {
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

    items.push({
        label: "Agent Trace",
        icon: faStopwatch,
        callback: /** @returns {void} */ () => {
            logSuppressedAgentDialog("Agent Trace");
        },
    });

    return items;
}

/**
 * @param {string} label
 */
function logSuppressedAgentDialog(label) {
    console.log("[GenomeSpy Agent] Suppressed dialog: " + label);
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
