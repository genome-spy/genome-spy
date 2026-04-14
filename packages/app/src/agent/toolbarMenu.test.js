// @ts-nocheck
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const { showAgentContextDialogMock } = vi.hoisted(() => ({
    showAgentContextDialogMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("../components/dialogs/agentContextDialog.js", () => ({
    showAgentContextDialog: showAgentContextDialogMock,
}));

import { getAgentMenuItems } from "./toolbarMenu.js";

describe("getAgentMenuItems", () => {
    it("returns no items when the agent is not enabled", () => {
        const items = getAgentMenuItems({
            agentAdapter: undefined,
        });

        expect(items).toEqual([]);
    });

    it("returns the agent menu items when enabled", async () => {
        const items = getAgentMenuItems(
            {
                agentAdapter: {
                    getAgentContext: vi.fn(),
                },
            },
            { isDev: true }
        );

        expect(items.map((item) => item.label)).toEqual(["Show Agent Context"]);
        await items[0].callback();
        expect(showAgentContextDialogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                agentAdapter: expect.objectContaining({
                    getAgentContext: expect.any(Function),
                }),
            })
        );
    });
});
