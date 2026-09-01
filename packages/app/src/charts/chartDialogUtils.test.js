// @vitest-environment jsdom
// @ts-check
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { embed } = vi.hoisted(() => ({
    embed: vi.fn(),
}));

vi.mock("@genome-spy/core", () => ({ embed }));

import { downloadChartPng, embedRenderablePlot } from "./chartDialogUtils.js";

describe("embedRenderablePlot", () => {
    beforeEach(() => {
        embed.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        document.body.replaceChildren();
    });

    it("downloads chart PNGs through the asynchronous export API", async () => {
        const blob = new Blob(["png"], { type: "image/png" });
        const raster = vi.fn().mockResolvedValue({ blob });
        const createObjectURL = vi.fn(() => "blob:chart");
        const revokeObjectURL = vi.fn();
        vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
        const click = vi
            .spyOn(HTMLAnchorElement.prototype, "click")
            .mockImplementation(() => undefined);
        const renderRoot = document.createElement("div");
        const container = document.createElement("div");
        container.className = "chart-container";
        Object.defineProperties(container, {
            clientWidth: { value: 320 },
            clientHeight: { value: 180 },
        });
        renderRoot.appendChild(container);

        await downloadChartPng(
            renderRoot,
            /** @type {any} */ ({ imageExport: { raster } }),
            "chart.png"
        );

        expect(raster).toHaveBeenCalledWith({
            logicalWidth: 320,
            logicalHeight: 180,
            pixelRatio: 3,
            background: "white",
        });
        expect(click).toHaveBeenCalledOnce();
        expect(createObjectURL).toHaveBeenCalledWith(blob);
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:chart");
        expect(document.body.querySelector("a")).toBeNull();
    });

    it("embeds plot data as root datasets", async () => {
        const api = { finalize: vi.fn() };
        embed.mockResolvedValue(api);
        const container = /** @type {HTMLElement} */ (
            /** @type {unknown} */ ({})
        );
        const configuredRows = [{ value: "configured" }];
        const runtimeRows = [{ value: "runtime" }];
        const addedRows = [{ value: "added" }];
        const spec = {
            mark: "point",
            data: { name: "results" },
            datasets: {
                configured: configuredRows,
                results: configuredRows,
            },
        };
        const plot =
            /** @type {import("./sampleAttributePlotTypes.d.ts").SampleAttributePlot} */ (
                /** @type {unknown} */ ({
                    spec,
                    namedData: [
                        { name: "results", rows: runtimeRows },
                        { name: "added", rows: addedRows },
                    ],
                })
            );

        const result = await embedRenderablePlot(container, plot);

        expect(result).toBe(api);
        expect(embed).toHaveBeenCalledWith(container, {
            ...spec,
            datasets: {
                configured: configuredRows,
                results: runtimeRows,
                added: addedRows,
            },
        });
        expect(spec.datasets.results).toBe(configuredRows);
    });
});
