// @ts-nocheck
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { AppMock } = vi.hoisted(() => ({
    AppMock: vi.fn(function App() {
        this.options = arguments[2];
        this.ui = {
            toolbarButtons: new Set(),
            toolbarMenuItems: new Set(),
            registerToolbarButton: vi.fn(),
            registerToolbarMenuItem: vi.fn(),
            registerDockedPanel: vi.fn(),
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

vi.mock("@genome-spy/core/index.js", () => ({
    loadSpec: vi.fn(async () => ({})),
}));

import { embed } from "./index.js";

describe("embed", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("installs and disposes app plugins", async () => {
        const pluginDispose = vi.fn();
        const plugin = {
            install: vi.fn(async () => pluginDispose),
        };

        const element = document.createElement("div");
        document.body.appendChild(element);

        const handle = await embed(element, {}, { plugins: [plugin] });

        expect(plugin.install).toHaveBeenCalledTimes(1);
        expect(plugin.install).toHaveBeenCalledWith(AppMock.mock.instances[0]);
        expect(AppMock).toHaveBeenCalledTimes(1);

        handle.finalize();

        expect(pluginDispose).toHaveBeenCalledTimes(1);
    });
});
