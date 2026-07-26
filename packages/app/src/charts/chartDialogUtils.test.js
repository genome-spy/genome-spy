// @ts-check
import { beforeEach, describe, expect, it, vi } from "vitest";

const { embed } = vi.hoisted(() => ({
    embed: vi.fn(),
}));

vi.mock("@genome-spy/core", () => ({ embed }));

import { embedRenderablePlot } from "./chartDialogUtils.js";

describe("embedRenderablePlot", () => {
    beforeEach(() => {
        embed.mockReset();
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
