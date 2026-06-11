import { describe, expect, it } from "vitest";
import { normalizeUrlDescriptors } from "./urlDescriptor.js";

function createRuntime(values) {
    return {
        createExpression: (expr) => {
            const fn = () => values[expr];
            fn.subscribe = () => () => undefined;
            return fn;
        },
        watchExpression: (expr) => {
            const fn = () => values[expr];
            fn.subscribe = () => () => undefined;
            return fn;
        },
    };
}

describe("normalizeUrlDescriptors", () => {
    it("expands scalar template values and attaches fields", async () => {
        const descriptors = await normalizeUrlDescriptors({
            url: {
                template: "coverage/{sample}.bw",
                values: ["A", "B"],
                field: "sample",
            },
            baseUrl: "https://example.org/spec/",
        });

        expect(descriptors).toEqual([
            {
                url: "https://example.org/spec/coverage/A.bw",
                fields: { sample: "A" },
            },
            {
                url: "https://example.org/spec/coverage/B.bw",
                fields: { sample: "B" },
            },
        ]);
    });

    it("uses ExprRef values for template expansion", async () => {
        const descriptors = await normalizeUrlDescriptors({
            url: {
                template: "coverage/{sample}.bw",
                values: { expr: "visibleSamples" },
                field: "sample",
            },
            paramRuntime: createRuntime({ visibleSamples: ["A"] }),
        });

        expect(descriptors).toEqual([
            { url: "coverage/A.bw", fields: { sample: "A" } },
        ]);
    });

    it("deduplicates by resolved url and indexUrl", async () => {
        const descriptors = await normalizeUrlDescriptors({
            url: {
                template: "variants/{cancer}.vcf.gz",
                values: ["ovarian", "ovarian"],
                field: "cancer",
            },
            indexUrl: { template: "variants/{cancer}.vcf.gz.tbi" },
        });

        expect(descriptors).toEqual([
            {
                url: "variants/ovarian.vcf.gz",
                indexUrl: "variants/ovarian.vcf.gz.tbi",
                fields: { cancer: "ovarian" },
            },
        ]);
    });

    it("throws when maxUrls is exceeded", async () => {
        await expect(
            normalizeUrlDescriptors({
                url: {
                    template: "coverage/{sample}.bw",
                    values: ["A", "B"],
                    field: "sample",
                    maxUrls: 1,
                },
            })
        ).rejects.toThrow("resolved 2 URLs, exceeding maxUrls 1");
    });
});
