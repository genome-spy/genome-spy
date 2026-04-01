// @vitest-environment jsdom
// @ts-check
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createAgentAdapterMock } = vi.hoisted(() => ({
    createAgentAdapterMock: vi.fn(() => ({
        getAgentContext: vi.fn(),
        runLocalPrompt: vi.fn(),
    })),
}));

const { AppMock } = vi.hoisted(() => ({
    AppMock: vi.fn(function App() {
        this.options = arguments[2];
        this.agentAdapter = this.options.agentAdapterFactory?.(this);
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

vi.mock("@genome-spy/core/index.js", () => ({
    loadSpec: vi.fn(async () => ({})),
}));

import { embed } from "./index.js";

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
        expect(AppMock).toHaveBeenCalledTimes(1);
        expect(AppMock.mock.instances[0].options.agentBaseUrl).toBe("http://x");
        expect(AppMock.mock.instances[0].options.showLocalAgentButton).toBe(
            true
        );

        handle.finalize();
    });

    it("keeps the agent disabled when the build flag is off", async () => {
        vi.stubEnv("VITE_AGENT_ENABLED", "false");

        const element = document.createElement("div");
        document.body.appendChild(element);

        const handle = await embed(element, {}, { agentBaseUrl: "http://x" });

        expect(createAgentAdapterMock).not.toHaveBeenCalled();
        expect(AppMock).toHaveBeenCalledTimes(1);
        expect(AppMock.mock.instances[0].options.agentBaseUrl).toBeUndefined();
        expect(AppMock.mock.instances[0].options.showLocalAgentButton).toBe(
            false
        );

        handle.finalize();
    });
});
