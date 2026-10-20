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
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        };
        this.genomeSpy = {
            destroy: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            getNamedScaleResolutions: vi.fn(() => new Map()),
            getParam: vi.fn(),
            awaitVisibleLazyData: vi.fn(),
            getRenderedBounds: vi.fn(),
            updateNamedData: vi.fn(),
            getLogicalCanvasSize: vi.fn(),
            exportCanvas: vi.fn(),
            exportRaster: vi.fn(),
            exportSvg: vi.fn(),
            analyzeSvgExport: vi.fn(),
        };
        this.launch = vi.fn(async () => true);
        this.finalize = vi.fn();
    }),
}));

vi.mock("./app.js", () => ({
    default: AppMock,
}));

vi.mock("@genome-spy/core/index.js", () => ({
    loadSpec: vi.fn(async () => ({})),
}));

import { embed } from "./index.js";
import { loadSpec } from "@genome-spy/core/index.js";

describe("embed", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
        document.body.replaceChildren();
    });

    it("preserves spec-loading errors instead of dereferencing an absent app", async () => {
        const error = new Error("Could not load configuration");
        loadSpec.mockRejectedValueOnce(error);
        const element = document.createElement("div");
        const onError = vi.fn();

        await expect(embed(element, "missing.json", { onError })).rejects.toBe(
            error
        );
        expect(AppMock).not.toHaveBeenCalled();
        expect(element.querySelector(".message-box").textContent).toBe(
            String(error)
        );
        expect(onError).toHaveBeenCalledOnce();
        expect(onError).toHaveBeenCalledWith(error, element);
    });

    it("preserves constructor errors", async () => {
        const error = new Error("Invalid app configuration");
        AppMock.mockImplementationOnce(function () {
            throw error;
        });
        const element = document.createElement("div");

        await expect(embed(element, {})).rejects.toBe(error);
        expect(element.querySelector(".message-box").textContent).toBe(
            String(error)
        );
    });

    it.each([false, true])(
        "rejects errors during App startup even if launch completes: %s",
        async (succeeded) => {
            const error = new Error("Core initialization failed");
            const element = document.createElement("div");
            const pluginDispose = vi.fn();
            const plugin = {
                install(app) {
                    app.launch.mockImplementation(async () => {
                        app.options.onError(error, element);
                        return succeeded;
                    });
                    return pluginDispose;
                },
            };
            const onError = vi.fn(() => {
                expect(pluginDispose).toHaveBeenCalledOnce();
                element.textContent = "Host error display";
                return true;
            });

            await expect(
                embed(element, {}, { plugins: [plugin], onError })
            ).rejects.toBe(error);
            expect(AppMock.mock.instances[0].finalize).toHaveBeenCalledOnce();
            expect(
                AppMock.mock.instances[0].genomeSpy.destroy
            ).toHaveBeenCalledOnce();
            expect(onError).toHaveBeenCalledOnce();
            expect(onError).toHaveBeenCalledWith(error, element);
            expect(element.textContent).toBe("Host error display");
        }
    );

    it("preserves plugin installation errors and finishes cleanup if a disposer throws", async () => {
        const error = new Error("Plugin installation failed");
        const cleanupError = new Error("Plugin cleanup failed");
        const disposals = [];
        const plugins = [
            {
                install: () => () => {
                    disposals.push("first");
                },
            },
            {
                install: () => () => {
                    disposals.push("second");
                    throw cleanupError;
                },
            },
            {
                install: async () => {
                    throw error;
                },
            },
        ];
        const element = document.createElement("div");

        await expect(embed(element, {}, { plugins })).rejects.toBe(error);
        expect(disposals).toEqual(["second", "first"]);
        expect(AppMock.mock.instances[0].finalize).toHaveBeenCalledOnce();
        expect(
            AppMock.mock.instances[0].genomeSpy.destroy
        ).toHaveBeenCalledOnce();
        expect(element.querySelector(".message-box").textContent).toBe(
            String(error)
        );
        expect(console.error).toHaveBeenCalledWith(cleanupError);

        const api = await embed(element, {});
        expect(element.textContent).not.toContain(error.message);
        expect(element.querySelector("style")).toBeNull();
        api.finalize();
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
        expect(handle.datasets).toMatchObject({
            set: expect.any(Function),
            load: expect.any(Function),
            reset: expect.any(Function),
        });

        handle.finalize();

        expect(pluginDispose).toHaveBeenCalledTimes(1);
        expect(AppMock.mock.instances[0].finalize).toHaveBeenCalledTimes(1);
        await expect(
            handle.datasets.load("values", new ArrayBuffer(0), {
                type: "arrow",
            })
        ).rejects.toMatchObject({ code: "staleEmbed" });
    });

    it("passes embedded mode to App", async () => {
        const element = document.createElement("div");
        document.body.appendChild(element);

        await embed(element, {}, { embedMode: "embedded" });

        expect(AppMock.mock.instances[0].options.embedMode).toBe("embedded");
    });

    it("forwards SVG export", async () => {
        const element = document.createElement("div");
        document.body.appendChild(element);
        const handle = await embed(element, {});
        const svgBlob = new Blob([], { type: "image/svg+xml" });
        const svgResult = { blob: svgBlob, warnings: [] };
        const exportSvg = AppMock.mock.instances[0].genomeSpy.exportSvg;
        exportSvg.mockResolvedValue(svgResult);

        await expect(handle.imageExport.svg()).resolves.toBe(svgResult);
        expect(exportSvg).toHaveBeenCalledOnce();
    });

    it("forwards raster export", async () => {
        const element = document.createElement("div");
        document.body.appendChild(element);
        const handle = await embed(element, {});
        const rasterResult = { blob: new Blob([], { type: "image/png" }) };
        const exportRaster = AppMock.mock.instances[0].genomeSpy.exportRaster;
        exportRaster.mockResolvedValue(rasterResult);

        await expect(handle.imageExport.raster()).resolves.toBe(rasterResult);
        expect(exportRaster).toHaveBeenCalledOnce();
    });
});
