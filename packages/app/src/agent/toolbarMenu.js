import { faEye, faRobot, faStopwatch } from "@fortawesome/free-solid-svg-icons";
import { showDialog } from "../components/generic/baseDialog.js";

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
    const items = [
        {
            label: "Local Agent",
            icon: faRobot,
            callback: () => app.agentAdapter.runLocalPrompt(),
        },
    ];

    if (isDev) {
        items.push({
            label: "Show Agent Context",
            icon: faEye,
            callback: /** @returns {void} */ () => {
                void showAgentContextDialog(app);
            },
        });
    }

    items.push({
        label: "Agent Trace",
        icon: faStopwatch,
        callback: /** @returns {void} */ () => {
            void showAgentTraceDialog(app);
        },
    });

    return items;
}

/**
 * @param {import("../app.js").default} app
 * @returns {Promise<void>}
 */
async function showAgentTraceDialog(app) {
    await import("../components/dialogs/agentTraceDialog.js");
    showDialog(
        "gs-agent-trace-dialog",
        (
            /** @type {import("../components/dialogs/agentTraceDialog.js").default} */ dialog
        ) => {
            dialog.app = app;
        }
    );
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
