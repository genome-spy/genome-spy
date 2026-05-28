// @ts-check
import { describe, expect, it } from "vitest";
import { buildMetadataSourceSummaries } from "./metadataSourceSummaries.js";

describe("buildMetadataSourceSummaries", () => {
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
