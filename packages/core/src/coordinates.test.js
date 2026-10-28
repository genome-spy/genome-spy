import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";
import { parseCoordinates, formatCoordinates } from "./coordinates.js";

const assembly = {
    contigs: [
        { name: "chr1", size: 100 },
        { name: "scaffold-2", size: 200 },
    ],
};

/** @param {string} query @param {import("./types/coordinates.js").CoordinateAssembly} [context] */
function interval(query, context) {
    const parsed = parseCoordinates(query, context);
    expect(parsed.kind).toBe("coordinate");
    if (parsed.kind !== "coordinate") throw new Error("Expected coordinates");
    return parsed.interval;
}

describe("optional coordinate utilities", () => {
    test("uses the same half-open representation with optional assembly validation", () => {
        for (const context of [undefined, assembly]) {
            expect(interval(" chr1:10-20 ", context)).toEqual([
                { chrom: "chr1", pos: 9 },
                { chrom: "chr1", pos: 20 },
            ]);
            expect(interval("chr1:1", context)).toEqual([
                { chrom: "chr1", pos: 0 },
                { chrom: "chr1", pos: 1 },
            ]);
            expect(interval("chr1:100-scaffold-2:200", context)).toEqual([
                { chrom: "chr1", pos: 99 },
                { chrom: "scaffold-2", pos: 200 },
            ]);
        }
        expect(interval("chr1", assembly)).toEqual([
            { chrom: "chr1", pos: 0 },
            { chrom: "chr1", pos: 100 },
        ]);
        expect(parseCoordinates("chr1")).toEqual({ kind: "not-coordinate" });
        expect(parseCoordinates("TP53", assembly)).toEqual({
            kind: "not-coordinate",
        });
        expect(parseCoordinates("17q21", assembly)).toEqual({
            kind: "not-coordinate",
        });
    });

    test.each([
        "chr1:0",
        "chr1:-1",
        "chr1:1.5",
        "chr1:1,,000",
        "chr1:1,00",
        "chr1:9007199254740992",
        "chr1:20-10",
    ])("rejects invalid syntax or same-contig order: %s", (query) => {
        for (const context of [undefined, assembly])
            expect(parseCoordinates(query, context).kind).toBe(
                "invalid-coordinate"
            );
    });

    test("only an assembly establishes bounds, contig existence, aliases, and inter-contig order", () => {
        for (const query of [
            "unknown:10",
            "chr1:101",
            "scaffold-2:10-chr1:20",
        ]) {
            expect(parseCoordinates(query).kind).toBe("coordinate");
            expect(parseCoordinates(query, assembly).kind).toBe(
                "invalid-coordinate"
            );
        }
        expect(parseCoordinates("chr99", assembly)).toMatchObject({
            kind: "invalid-coordinate",
            code: "unknown-contig",
        });
        expect(interval("1:1-10", assembly)[0].chrom).toBe("chr1");
        const custom = {
            contigs: [
                { name: "a", size: 10 },
                { name: "chra", size: 20 },
                { name: "1", size: 30 },
                { name: "NC_001.1", size: 40 },
            ],
        };
        expect(interval("a:1", custom)[0].chrom).toBe("a");
        expect(interval("chra:1", custom)[0].chrom).toBe("chra");
        expect(parseCoordinates("CHRa:1", custom).kind).toBe(
            "invalid-coordinate"
        );
        expect(interval("1:1", custom)[0].chrom).toBe("1");
        expect(interval("NC_001.1:40", custom)[1].pos).toBe(40);
        expect(
            parseCoordinates("2:1", {
                contigs: [
                    { name: "a", size: 10 },
                    { name: "b", size: 10 },
                ],
            }).kind
        ).toBe("invalid-coordinate");
    });

    test("supports dictionary names with delimiters and rejects genuine ambiguity", () => {
        expect(
            interval("a:1-b:2", { contigs: [{ name: "a:1-b", size: 5 }] })[0]
        ).toEqual({ chrom: "a:1-b", pos: 1 });
        expect(
            interval("a:1-b:2-c:3", {
                contigs: [
                    { name: "a", size: 10 },
                    { name: "b:2-c", size: 10 },
                ],
            })
        ).toEqual([
            { chrom: "a", pos: 0 },
            { chrom: "b:2-c", pos: 3 },
        ]);
        expect(
            parseCoordinates("a:1-b:2", {
                contigs: [
                    { name: "a", size: 5 },
                    { name: "b", size: 5 },
                    { name: "a:1-b", size: 5 },
                ],
            })
        ).toMatchObject({
            kind: "invalid-coordinate",
            code: "ambiguous-contig",
        });
    });

    test("formats independent of assembly and round-trips inclusive display endpoints", () => {
        for (const query of [
            "chr1:1",
            "chr1:10-20",
            "chr1:100-scaffold-2:200",
            "scaffold_12:1,000-2,000",
        ]) {
            const parsed = interval(query);
            expect(interval(formatCoordinates(parsed))).toEqual(parsed);
        }
        expect(
            formatCoordinates([
                { chrom: "chr1", pos: 0.75 },
                { chrom: "chr1", pos: 1.25 },
            ])
        ).toBe("chr1:1-2");
        expect(() =>
            formatCoordinates([
                { chrom: "chr1", pos: 0 },
                { chrom: "chr2", pos: 0 },
            ])
        ).toThrow();
        expect(() =>
            formatCoordinates([
                { chrom: "chr1", pos: 2 },
                { chrom: "chr1", pos: 1 },
            ])
        ).toThrow();
    });

    test("validates supplied dictionaries at the boundary", () => {
        for (const contigs of [
            [{ name: "", size: 10 }],
            [{ name: "a", size: 0 }],
            [
                { name: "a", size: 1 },
                { name: "a", size: 2 },
            ],
        ]) {
            expect(() => parseCoordinates("a:1", { contigs })).toThrow();
        }
    });
});

test("public coordinate entry imports in Node without DOM globals", () => {
    expect(
        execFileSync(
            process.execPath,
            [
                "--input-type=module",
                "-e",
                'import {parseCoordinates} from "@genome-spy/core/coordinates"; process.stdout.write(parseCoordinates("chr1:1").kind)',
            ],
            { encoding: "utf8" }
        )
    ).toBe("coordinate");
});
