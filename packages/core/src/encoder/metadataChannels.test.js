import { describe, expect, it } from "vitest";
import {
    getEncodingKeyFields,
    getEncodingSearchFields,
} from "./metadataChannels.js";

describe("metadata channel field normalization", () => {
    it("extracts key fields from encoding", () => {
        expect(getEncodingKeyFields({})).toBeUndefined();
        expect(getEncodingKeyFields({ key: { field: "id" } })).toEqual(["id"]);
        expect(
            getEncodingKeyFields({
                key: [
                    { field: "sampleId" },
                    { field: "chrom" },
                    { field: "pos" },
                ],
            })
        ).toEqual(["sampleId", "chrom", "pos"]);
    });

    it("fails on invalid key field configurations", () => {
        expect(() => getEncodingKeyFields({ key: [] })).toThrow(
            /must not be empty/
        );
        expect(() =>
            getEncodingKeyFields({
                key: /** @type {any} */ ([{ field: "a" }, { value: 1 }]),
            })
        ).toThrow(/field definition/);
        expect(
            getEncodingKeyFields({
                key: [{ field: "a" }, { field: "a" }],
            })
        ).toEqual(["a", "a"]);
    });

    it("extracts search fields from encoding", () => {
        expect(getEncodingSearchFields({})).toBeUndefined();
        expect(getEncodingSearchFields({ search: { field: "gene" } })).toEqual([
            "gene",
        ]);
        expect(
            getEncodingSearchFields({
                search: [{ field: "gene" }, { field: "alias" }],
            })
        ).toEqual(["gene", "alias"]);
    });

    it("fails on invalid search field configurations", () => {
        expect(() =>
            getEncodingSearchFields({
                search: /** @type {any} */ ([]),
            })
        ).toThrow(/must not be empty/);
        expect(() =>
            getEncodingSearchFields({
                search: /** @type {any} */ ([{ field: "gene" }, { value: 1 }]),
            })
        ).toThrow(/field definition/);
    });
});
