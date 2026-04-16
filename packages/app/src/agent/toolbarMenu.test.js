// @ts-nocheck
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { getAgentState } from "./agentState.js";

const { showAgentContextDialogMock } = vi.hoisted(() => ({
    showAgentContextDialogMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("../components/dialogs/agentContextDialog.js", () => ({
    showAgentContextDialog: showAgentContextDialogMock,
}));

import { getAgentMenuItems } from "./toolbarMenu.js";

describe("getAgentMenuItems", () => {
    it("returns no items when the agent is not enabled", () => {
        const app = {};
        const items = getAgentMenuItems(app);

        expect(items).toEqual([]);
    });

    it("returns the agent menu items when enabled", async () => {
        const app = {};
        getAgentState(app).agentAdapter = {
            getAgentContext: vi.fn(),
        };
        const items = getAgentMenuItems(app, { isDev: true });

        expect(items.map((item) => item.label)).toEqual(["Show Agent Context"]);
        await items[0].callback();
        expect(showAgentContextDialogMock).toHaveBeenCalledWith(app);
    });
});
