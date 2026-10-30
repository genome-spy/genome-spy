// @ts-check
import { describe, expect, it, vi } from "vitest";
import { buildMetadataSourceSummaries } from "./metadataSourceSummaries.js";

describe("buildMetadataSourceSummaries", () => {
    it("settles sibling reads before reporting a source failure", async () => {
        const error = new Error("Broken source");
        const pending = Promise.withResolvers();
        const read = vi.fn((sourceId) =>
            sourceId === "broken" ? Promise.reject(error) : pending.promise
        );
        const summaries = buildMetadataSourceSummaries(
            ["broken", "pending"].map((id) => ({
                id,
                initialLoad: false,
                backend: { backend: "data", data: { values: [] } },
            })),
            {
                getAdapter: (source) =>
                    /** @type {any} */ ({
                        listIdentifierExamples: () => read(source.id),
                    }),
            }
        );
        const settled = vi.fn();
        void summaries.then(settled, settled);
        await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
        expect(settled).not.toHaveBeenCalled();

        pending.resolve([]);
        await expect(summaries).rejects.toBe(error);
    });

    it("requires caller-provided adapters", async () => {
        await expect(
            buildMetadataSourceSummaries([
                {
                    id: "clinical",
                    initialLoad: false,
                    backend: {
                        backend: "data",
                        data: {
                            values: [{ sample: "s1", status: "A" }],
                        },
                    },
                },
            ])
        ).rejects.toThrow("Metadata source summary adapter is required.");
    });
});
