import { describe, expect, test } from "vitest";
import { formats as vegaFormats } from "vega-loader";
import bed from "../formats/bed.js";
import {
    extractTypeFromUrl,
    getFormat,
    hasGzipExtension,
} from "./dataUtils.js";

vegaFormats("bed", bed);

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
                url: "data.bed",
                format: {
                    type: "bed",
                    parse: {
                        score: "number",
                    },
                },
            })
        ).toEqual({
            type: "bed",
            parse: {
                score: "number",
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

    test("infers the format type from a gzip-compressed file name", () => {
        expect(
            getFormat(
                {
                    url: "data.tsv.gz",
                },
                "data.tsv.gz"
            )
        ).toEqual({
            type: "tsv",
            parse: "auto",
        });
    });
});

describe("extractTypeFromUrl", () => {
    test("strips a gzip suffix before inferring the file type", () => {
        expect(extractTypeFromUrl("https://example.com/data.bed.gz?dl=1")).toBe(
            "bed"
        );
    });
});

describe("hasGzipExtension", () => {
    test("detects gzip-compressed file names", () => {
        expect(hasGzipExtension("data.tsv.gz")).toBe(true);
        expect(hasGzipExtension("data.tsv")).toBe(false);
    });
});
