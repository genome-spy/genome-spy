// @ts-nocheck
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createAgentAdapterMock } = vi.hoisted(() => ({
    createAgentAdapterMock: vi.fn(() => ({
        getAgentContext: vi.fn(),
    })),
}));

const { registerAgentUiMock } = vi.hoisted(() => ({
    registerAgentUiMock: vi.fn(),
}));

const { AppMock } = vi.hoisted(() => ({
    AppMock: vi.fn(function App() {
        this.options = arguments[2];
        this.ui = {
            toolbarButtons: new Set(),
            toolbarMenuItems: new Set(),
            registerToolbarButton: vi.fn(),
            registerToolbarMenuItem: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        };
        this.genomeSpy = {
            destroy: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            getNamedScaleResolutions: vi.fn(() => new Map()),
            awaitVisibleLazyData: vi.fn(),
            getRenderedBounds: vi.fn(),
            updateNamedData: vi.fn(),
            getLogicalCanvasSize: vi.fn(),
            exportCanvas: vi.fn(),
        };
        this.launch = vi.fn(async () => true);
    }),
}));

vi.mock("./app.js", () => ({
    default: AppMock,
}));

vi.mock("./agent/agentAdapter.js", () => ({
    createAgentAdapter: createAgentAdapterMock,
}));

vi.mock("./agent/agentUi.js", () => ({
    registerAgentUi: registerAgentUiMock,
}));

vi.mock("@genome-spy/core/index.js", () => ({
    loadSpec: vi.fn(async () => ({})),
}));

import { embed } from "./index.js";
import { getAgentState } from "./agent/agentState.js";

describe("embed", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv("VITE_AGENT_ENABLED", "true");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("loads the agent adapter only when an agent base URL is configured", async () => {
        const element = document.createElement("div");
        document.body.appendChild(element);

        const handle = await embed(element, {}, { agentBaseUrl: "http://x" });

        expect(createAgentAdapterMock).toHaveBeenCalledTimes(1);
        expect(registerAgentUiMock).toHaveBeenCalledTimes(1);
        expect(AppMock).toHaveBeenCalledTimes(1);
        expect(getAgentState(AppMock.mock.instances[0]).agentBaseUrl).toBe(
            "http://x"
        );
        expect(getAgentState(AppMock.mock.instances[0]).agentAdapter).toEqual(
            createAgentAdapterMock.mock.results[0].value
        );

        handle.finalize();
    });

    it("keeps the agent disabled when the build flag is off", async () => {
        vi.stubEnv("VITE_AGENT_ENABLED", "false");

        const element = document.createElement("div");
        document.body.appendChild(element);

        const handle = await embed(element, {}, { agentBaseUrl: "http://x" });

        expect(createAgentAdapterMock).not.toHaveBeenCalled();
        expect(registerAgentUiMock).not.toHaveBeenCalled();
        expect(AppMock).toHaveBeenCalledTimes(1);
        expect(
            getAgentState(AppMock.mock.instances[0]).agentBaseUrl
        ).toBeUndefined();

        handle.finalize();
    });
});
