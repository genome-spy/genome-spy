// @ts-nocheck
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { getAgentMenuItems } from "./toolbarMenu.js";

describe("getAgentMenuItems", () => {
    it("returns no items when the agent is not enabled", () => {
        const items = getAgentMenuItems({
            options: { showLocalAgentButton: false },
            agentAdapter: undefined,
        });

        expect(items).toEqual([]);
    });

    it("returns the agent menu items when enabled", () => {
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
            "Copy Agent Context",
            "Agent Trace",
        ]);
    });
});
