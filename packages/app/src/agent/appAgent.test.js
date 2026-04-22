// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const { createAgentAdapterMock } = vi.hoisted(() => ({
    createAgentAdapterMock: vi.fn(() => ({
        getAgentContext: vi.fn(),
    })),
}));

const { registerAgentUiMock } = vi.hoisted(() => ({
    registerAgentUiMock: vi.fn(),
}));

vi.mock("./agentAdapter.js", () => ({
    createAgentAdapter: createAgentAdapterMock,
}));

vi.mock("./agentUi.js", () => ({
    registerAgentUi: registerAgentUiMock,
}));

import { appAgent } from "./appAgent.js";
import { getAgentState } from "./agentState.js";

describe("appAgent", () => {
    it("installs the agent runtime and returns cleanup", async () => {
        const uiDispose = vi.fn();
        registerAgentUiMock.mockReturnValue(uiDispose);

        const app = {
            ui: {
                registerToolbarButton: vi.fn(),
                registerToolbarMenuItem: vi.fn(),
                registerDockedPanel: vi.fn(),
            },
            getAgentApi: vi.fn(async () => ({})),
        };

        const plugin = appAgent({ baseUrl: "http://localhost:8001" });
        const dispose = await plugin.install(app);

        expect(app.getAgentApi).toHaveBeenCalledTimes(1);
        expect(createAgentAdapterMock).toHaveBeenCalledTimes(1);
        expect(createAgentAdapterMock).toHaveBeenCalledWith(
            app,
            expect.any(Object)
        );
        expect(registerAgentUiMock).toHaveBeenCalledTimes(1);
        expect(getAgentState(app).agentBaseUrl).toBe("http://localhost:8001");
        expect(getAgentState(app).agentAdapter).toEqual(
            createAgentAdapterMock.mock.results[0].value
        );

        dispose();

        expect(uiDispose).toHaveBeenCalledTimes(1);
        expect(getAgentState(app).agentBaseUrl).toBeUndefined();
        expect(getAgentState(app).agentAdapter).toBeUndefined();
    });
});
