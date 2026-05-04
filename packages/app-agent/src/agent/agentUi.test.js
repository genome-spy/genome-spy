// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const { getAgentStateMock } = vi.hoisted(() => ({
    getAgentStateMock: vi.fn(() => ({
        agentAdapter: {},
    })),
}));

const { showAgentVolatileContextDialogMock } = vi.hoisted(() => ({
    showAgentVolatileContextDialogMock: vi.fn(),
}));

vi.mock("./agentState.js", () => ({
    getAgentState: getAgentStateMock,
}));

vi.mock("../components/dialogs/volatileContextDialog.js", () => ({
    showAgentVolatileContextDialog: showAgentVolatileContextDialogMock,
}));

import { registerAgentUi } from "./agentUi.js";

describe("registerAgentUi", () => {
    it("adds a volatile context menu item in development", async () => {
        const menuItems = [];
        const app = {
            ui: {
                registerToolbarButton: vi.fn(() => vi.fn()),
                registerToolbarMenuItem: vi.fn((item) => {
                    menuItems.push(item);
                    return vi.fn();
                }),
            },
        };

        const dispose = registerAgentUi(app);

        expect(app.ui.registerToolbarMenuItem).toHaveBeenCalledTimes(3);
        expect(menuItems.map((item) => item.label)).toContain(
            "Show Volatile Context"
        );

        const volatileContextMenuItem = menuItems.find(
            (item) => item.label === "Show Volatile Context"
        );
        await volatileContextMenuItem.callback();

        expect(showAgentVolatileContextDialogMock).toHaveBeenCalledTimes(1);

        dispose();
    });
});
