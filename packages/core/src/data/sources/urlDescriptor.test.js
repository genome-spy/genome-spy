import { describe, expect, it } from "vitest";
import {
    createDescriptorFieldAttacher,
    normalizeUrlDescriptors,
    normalizeSingleUrlDescriptor,
    UrlLimitExceededError,
    watchUrlDescriptorExpressions,
} from "./urlDescriptor.js";

/**
 * @param {Record<string, any>} values
 */
function createRuntime(values) {
    return {
        createExpression: (/** @type {string} */ expr) => {
            const fn = () => values[expr];
            fn.subscribe = /** @returns {() => undefined} */ () => {
                return () => undefined;
            };
            return fn;
        },
        watchExpression: (/** @type {string} */ expr) => {
            const fn = () => values[expr];
            fn.subscribe = /** @returns {() => undefined} */ () => {
                return () => undefined;
            };
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

    it("can use template values without attaching fields", async () => {
        const descriptors = await normalizeUrlDescriptors({
            url: {
                template: "variants/{patient}.tsv",
                values: ["patient1"],
                field: "patient",
                attach: false,
            },
        });

        expect(descriptors).toEqual([{ url: "variants/patient1.tsv" }]);
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

    it("throws a typed error when maxValues is exceeded", async () => {
        await expect(
            normalizeUrlDescriptors({
                url: {
                    template: "coverage/{sample}.bw",
                    values: ["A", "B"],
                    field: "sample",
                    maxValues: 1,
                },
            })
        ).rejects.toThrow(UrlLimitExceededError);
    });

    it("normalizes a source that expects one resolved descriptor", async () => {
        await expect(
            normalizeSingleUrlDescriptor(
                {
                    url: ["a.bam", "b.bam"],
                },
                "BamSource"
            )
        ).rejects.toThrow("BamSource supports exactly one resolved URL.");
    });

    it("watches nested template value expressions", () => {
        /** @type {string[]} */
        const watched = [];
        watchUrlDescriptorExpressions({
            url: {
                template: "coverage/{sample}.bw",
                values: { expr: "visibleSamples" },
                field: "sample",
            },
            paramRuntime: {
                watchExpression: (/** @type {string} */ expr) => {
                    watched.push(expr);
                    return /** @returns {any[]} */ function unsubscribe() {
                        return [];
                    };
                },
                createExpression: /** @returns {any} */ () => {
                    return /** @returns {undefined} */ function expr() {
                        return undefined;
                    };
                },
            },
            listener: () => undefined,
        });

        expect(watched).toEqual(["visibleSamples"]);
    });
});

describe("createDescriptorFieldAttacher", () => {
    it("returns datums unchanged when fields are disabled", () => {
        const attach = createDescriptorFieldAttacher(undefined);
        const datum = { value: 1 };

        expect(attach(datum)).toBe(datum);
        expect(datum).toEqual({ value: 1 });
    });

    it("mutates source-owned datums when attaching fields", () => {
        const attach = createDescriptorFieldAttacher({ patient: "patient1" });
        const datum = { value: 1 };

        expect(attach(datum)).toBe(datum);
        expect(datum).toEqual({ patient: "patient1", value: 1 });
    });

    it("throws when an attached field conflicts with a loaded datum", () => {
        const attach = createDescriptorFieldAttacher({ patient: "patient1" });

        expect(() => attach({ patient: "patient2" })).toThrow(
            'Descriptor field "patient" conflicts with loaded datum.'
        );
    });
});
