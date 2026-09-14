import { describe, expect, it } from "vitest";
import UrlDescriptorController from "./urlDescriptorController.js";

describe("UrlDescriptorController", () => {
    it("normalizes descriptors using the source base URL and parameter runtime", async () => {
        const controller = new UrlDescriptorController(
            /** @type {any} */ (createSource()),
            {
                getUrl: () => ({
                    template: "signals/{sample}.bw",
                    values: { expr: "visibleSamples" },
                    field: "sample",
                }),
            }
        );

        await expect(controller.normalize()).resolves.toEqual([
            {
                url: "https://example.org/spec/signals/A.bw",
                fields: { sample: "A" },
            },
        ]);
    });
});

function createSource() {
    return {
        view: {
            getBaseUrl: () => "https://example.org/spec/",
        },
        paramRuntime: {
            createExpression: (/** @type {string} */ expr) => {
                return /** @returns {string[] | undefined} */ () =>
                    expr == "visibleSamples" ? ["A"] : undefined;
            },
        },
    };
}
