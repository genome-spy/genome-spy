// @ts-nocheck
import { describe, it, expect, beforeEach } from "vitest";
import {
    validateMetadata,
    MISSING_SAMPLE_FIELD_ERROR,
    NO_VALID_SAMPLES_ERROR,
    EMPTY_SAMPLE_FIELD_ERROR,
    DUPLICATE_SAMPLE_IDS_ERROR,
} from "./metadataValidation.js";
import { buildSetMetadataPayload } from "./metadataUtils.js";

describe("validateMetadata", () => {
    it("aggregates multiple error types and counts occurrences", () => {
        const existing = ["s1", "s2", "s3"];

        // mixed input with missing, duplicates and new samples
        const records = [
            {},
            { sample: "s1" },
            { sample: "s1" },
            { sample: "s4" },
            { foo: "bar" },
            { sample: "" },
        ];

        const res = validateMetadata(existing, records);

        expect(res).toHaveProperty("error");
        const errs = res.error;
        // must contain an entry for missing sample errors
        const missing = errs.find(
            (e) => e.message === MISSING_SAMPLE_FIELD_ERROR
        );
        expect(missing).toBeDefined();
        expect(missing.count).toBe(2);
        const empty = errs.find((e) => e.message === EMPTY_SAMPLE_FIELD_ERROR);
        expect(empty).toBeDefined();
        expect(empty.count).toBe(1);
        // must contain an entry for duplicate-sample error
        const dup = errs.find((e) => e.message === DUPLICATE_SAMPLE_IDS_ERROR);
        expect(dup).toBeDefined();
        expect(dup.count).toBe(1);
        // when errors present, statistics should not be returned
        expect(res.statistics).toBeUndefined();
    });

    it("returns NO_VALID_SAMPLES_ERROR when there are no valid samples", () => {
        const existing = [];
        const records = [];
        const res = validateMetadata(existing, records);
        expect(res).toHaveProperty("error");
        const errs = res.error;
        const noSamples = errs.find(
            (e) => e.message === NO_VALID_SAMPLES_ERROR
        );
        expect(noSamples).toBeDefined();
        expect(noSamples.count).toBe(1);
    });

    it("computes correct statistics when input is valid", () => {
        const existing = ["a", "b"];
        const records = [{ sample: "a" }, { sample: "c" }];
        const res = validateMetadata(existing, records);
        expect(res).toHaveProperty("statistics");
        const s = res.statistics;
        expect(s.unknownSamples.size).toBe(1);
        expect(s.notCoveredSamples.size).toBe(1);
        expect(s.samplesInBoth.size).toBe(1);
    });
});

describe("buildSetMetadataPayload", () => {
    it("filters rows and skips unset columns", () => {
        const parsedItems = [
            { sample: "s1", a: 1, b: 2 },
            { sample: "s2", a: 3, b: 4 },
        ];

        const metadataConfig = {
            separator: null,
            addUnderGroup: "",
            scales: new Map([["a", { type: "linear" }]]),
            metadataNodeTypes: new Map([
                ["a", "quantitative"],
                ["b", "unset"],
            ]),
        };

        const result = buildSetMetadataPayload(
            parsedItems,
            new Set(["s1"]),
            metadataConfig
        );

        expect(result.columnarMetadata).toEqual({
            sample: ["s1"],
            a: [1],
        });

        expect(result.attributeDefs).toEqual({
            a: { type: "quantitative", scale: { type: "linear" } },
        });
    });

    it("applies separator conversion and group prefix", () => {
        const parsedItems = [
            { sample: "s1", "clin.age": 30 },
            { sample: "s2", "clin.age": 25 },
        ];

        const metadataConfig = {
            separator: ".",
            addUnderGroup: "extra.group",
            scales: new Map(),
            metadataNodeTypes: new Map([["clin/age", "quantitative"]]),
        };

        const result = buildSetMetadataPayload(
            parsedItems,
            new Set(["s1", "s2"]),
            metadataConfig
        );

        expect(result.columnarMetadata).toEqual({
            sample: ["s1", "s2"],
            "extra/group/clin/age": [30, 25],
        });

        expect(result.attributeDefs).toEqual({
            "extra/group/clin/age": { type: "quantitative" },
        });
    });

    it("applies root definition to inherit nodes when no group is set", () => {
        const parsedItems = [
            { sample: "s1", child: "a" },
            { sample: "s2", child: "b" },
        ];

        const metadataConfig = {
            separator: null,
            addUnderGroup: null,
            scales: new Map([["", { type: "ordinal" }]]),
            metadataNodeTypes: new Map([
                ["", "nominal"],
                ["child", "inherit"],
            ]),
        };

        const result = buildSetMetadataPayload(
            parsedItems,
            new Set(["s1", "s2"]),
            metadataConfig
        );

        expect(result.attributeDefs).toEqual({
            child: { type: "nominal", scale: { type: "ordinal" } },
        });
    });

    it("applies root definition to the new group when adding under a group", () => {
        const parsedItems = [{ sample: "s1", value: 10 }];

        const metadataConfig = {
            separator: ".",
            addUnderGroup: "group.sub",
            scales: new Map([["", { type: "linear" }]]),
            metadataNodeTypes: new Map([["", "quantitative"]]),
        };

        const result = buildSetMetadataPayload(
            parsedItems,
            new Set(["s1"]),
            metadataConfig
        );

        expect(result.attributeDefs).toEqual({
            "group/sub": { type: "quantitative", scale: { type: "linear" } },
        });
    });

    it("treats slash in addUnderGroup as literal when separator is not defined", () => {
        const parsedItems = [{ sample: "s1", value: 10 }];

        const metadataConfig = {
            separator: null,
            addUnderGroup: "group/sub",
            scales: new Map([["", { type: "linear" }]]),
            metadataNodeTypes: new Map([["", "quantitative"]]),
        };

        const result = buildSetMetadataPayload(
            parsedItems,
            new Set(["s1"]),
            metadataConfig
        );

        expect(result.attributeDefs).toEqual({
            "group\\/sub": { type: "quantitative", scale: { type: "linear" } },
        });
    });
});
