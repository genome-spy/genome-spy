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
            options: { showLocalAgentButton: false },
            agentAdapter: undefined,
        });

        expect(items).toEqual([]);
    });

    it("returns the agent menu items when enabled", async () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const items = getAgentMenuItems(
            {
                options: { showLocalAgentButton: true },
                agentAdapter: {
                    runLocalPrompt: vi.fn(),
                    getAgentContext: vi.fn(),
                },
            },
            { isDev: true }
        );

        expect(items.map((item) => item.label)).toEqual([
            "Local Agent",
            "Show Agent Context",
            "Agent Trace",
        ]);
        await items[1].callback();
        items[2].callback();
        expect(showAgentContextDialogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                options: { showLocalAgentButton: true },
            })
        );
        expect(logSpy).toHaveBeenCalledTimes(1);
        expect(logSpy).toHaveBeenCalledWith(
            "[GenomeSpy Agent] Suppressed dialog: Agent Trace"
        );
    });
});
