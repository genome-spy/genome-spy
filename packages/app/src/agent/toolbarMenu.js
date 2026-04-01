import {
    faCopy,
    faRobot,
    faStopwatch,
} from "@fortawesome/free-solid-svg-icons";
import { showDialog } from "../components/generic/baseDialog.js";
import { showMessageDialog } from "../components/generic/messageDialog.js";

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
            label: "Copy Agent Context",
            icon: faCopy,
            callback: () => void copyAgentContext(app),
        });
    }

    items.push({
        label: "Agent Trace",
        icon: faStopwatch,
        callback: () => void showAgentTraceDialog(app),
    });

    return items;
}

/**
 * @param {import("../app.js").default} app
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
 */
async function copyAgentContext(app) {
    const context = app.agentAdapter?.getAgentContext?.();
    if (!context) {
        await showMessageDialog("No agent context is available yet.", {
            title: "Agent Context",
            type: "info",
        });
        return;
    }

    try {
        await navigator.clipboard.writeText(JSON.stringify(context, null, 2));
        await showMessageDialog(
            "The current agent context was copied to the clipboard.",
            {
                title: "Agent Context",
                type: "info",
            }
        );
    } catch {
        await showMessageDialog(
            "The agent context could not be copied. Your browser may block clipboard access.",
            {
                title: "Agent Context",
                type: "info",
            }
        );
    }
}
