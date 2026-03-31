import { expect, test } from "vitest";
import {
    extractTabixTsvColumns,
    extractTabixTsvColumnsFromFirstLine,
    parseTabixTsvLines,
} from "./tabixTsvSource.js";

test("extractTabixTsvColumns reads a commented tabix header", () => {
    // The tabix header often contains metadata lines before the column line.
    const header = [
        "##fileformat=tabix-tsv",
        "##source=genome-spy",
        "#chrom\tstart\tend\tvalue",
    ].join("\n");

    expect(extractTabixTsvColumns(header)).toEqual([
        "chrom",
        "start",
        "end",
        "value",
    ]);
});

test("extractTabixTsvColumnsFromFirstLine reads an unprefixed tabix header", () => {
    const header = [
        "##fileformat=tabix-tsv",
        "##source=genome-spy",
        "chrom\tstart\tend\tvalue",
        "chr1\t10\t20\tfoo",
    ].join("\n");

    expect(extractTabixTsvColumnsFromFirstLine(header)).toEqual([
        "chrom",
        "start",
        "end",
        "value",
    ]);
});

test("parseTabixTsvLines parses headerless rows using provided columns", () => {
    expect(
        parseTabixTsvLines(
            ["chr1\t10\t20", "chr2\t30\t40"],
            ["chrom", "start", "end"]
        )
    ).toEqual([
        {
            chrom: "chr1",
            start: 10,
            end: 20,
        },
        {
            chrom: "chr2",
            start: 30,
            end: 40,
        },
    ]);
});

test("parseTabixTsvLines preserves the first column as a string", () => {
    const result = parseTabixTsvLines(
        ["8\t56649825\t0.817", "8\t56649826\t0.823", "9\t56649827\t0.815"],
        ["chromosome", "base_pair_location", "p_value"]
    );

    expect(result[0].chromosome).toBe("8");
    expect(result[1].chromosome).toBe("8");
    expect(result[2].chromosome).toBe("9");
});

test("parseTabixTsvLines honors explicit parse mappings", () => {
    expect(
        parseTabixTsvLines(["chr1\t10\t3.5"], ["chrom", "start", "score"], {
            score: "number",
        })
    ).toEqual([
        {
            chrom: "chr1",
            start: "10",
            score: 3.5,
        },
    ]);
});
