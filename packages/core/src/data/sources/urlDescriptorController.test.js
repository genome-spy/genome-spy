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
                onChange: () => undefined,
            }
        );

        await expect(controller.normalize()).resolves.toEqual([
            {
                url: "https://example.org/spec/signals/A.bw",
                fields: { sample: "A" },
            },
        ]);
    });

    it("watches nested descriptor expressions but not top-level ExprRefs", () => {
        /** @type {string[]} */
        const watched = [];
        const source = createSource(watched);

        new UrlDescriptorController(/** @type {any} */ (source), {
            getUrl: () => ({
                template: "signals/{sample}.bw",
                values: { expr: "visibleSamples" },
                field: "sample",
            }),
            onChange: () => undefined,
        });
        new UrlDescriptorController(/** @type {any} */ (source), {
            getUrl: () => ({ expr: "urlParam" }),
            onChange: () => undefined,
        });

        expect(watched).toEqual(["visibleSamples"]);
    });
});

/**
 * @param {string[]} watched
 */
function createSource(watched = []) {
    return {
        view: {
            getBaseUrl: () => "https://example.org/spec/",
        },
        paramRuntime: {
            createExpression: (/** @type {string} */ expr) => {
                return /** @returns {string[] | undefined} */ () =>
                    expr == "visibleSamples" ? ["A"] : undefined;
            },
            watchExpression: (/** @type {string} */ expr) => {
                watched.push(expr);
                return /** @returns {undefined} */ () => undefined;
            },
        },
        registerDisposer: /** @returns {undefined} */ () => undefined,
    };
}
