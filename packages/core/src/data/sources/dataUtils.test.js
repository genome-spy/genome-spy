import { describe, expect, test } from "vitest";
import { getFormat } from "./dataUtils.js";

describe("getFormat", () => {
    test("defaults parse to auto for csv-like formats", () => {
        expect(
            getFormat(
                {
                    url: "data.tsv",
                    format: {
                        type: "tsv",
                    },
                },
                "data.tsv"
            )
        ).toEqual({
            type: "tsv",
            parse: "auto",
        });
    });

    test("does not force parse auto for genomic text formats", () => {
        expect(
            getFormat({
                url: "data.bed",
                format: {
                    type: "bed",
                },
            })
        ).toEqual({
            type: "bed",
        });
    });

    test("preserves explicit parse mappings for genomic text formats", () => {
        expect(
            getFormat({
                url: "data.maf",
                format: {
                    type: "maf",
                    parse: {
                        t_alt_count: "number",
                    },
                },
            })
        ).toEqual({
            type: "maf",
            parse: {
                t_alt_count: "number",
            },
        });
    });

    test("preserves parse null", () => {
        expect(
            getFormat({
                url: "data.tsv",
                format: {
                    type: "tsv",
                    parse: null,
                },
            })
        ).toEqual({
            type: "tsv",
            parse: null,
        });
    });
});
