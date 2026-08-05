import { expect, test } from "vitest";
import fasta from "./fasta.js";

test("fasta", () => {
    const fileContent = `>A stuff
--------------------------AGAGTTTGATCCTGGCTCAGGGTGAACGCTGGCG
GCGTGC----TTAAGACATGCAAGTCGAACGG-CCT------TCTTCG-G-AAGGC-AGT
---------------------------------
>B other stuff
--------------------------AGAGTTTGATCATGGCTCAGGGTGAACGCTGGCG
GCGTGC----TTAAGACATGCAAGTCGGACGA-TCG------GCTTCG---GCCGGTAGT
---------------------------------
`;

    expect(fasta(fileContent)).toEqual([
        {
            identifier: "A",
            sequence:
                "--------------------------AGAGTTTGATCCTGGCTCAGGGTGAACGCTGGCGGCGTGC----TTAAGACATGCAAGTCGAACGG-CCT------TCTTCG-G-AAGGC-AGT---------------------------------",
        },
        {
            identifier: "B",
            sequence:
                "--------------------------AGAGTTTGATCATGGCTCAGGGTGAACGCTGGCGGCGTGC----TTAAGACATGCAAGTCGGACGA-TCG------GCTTCG---GCCGGTAGT---------------------------------",
        },
    ]);
});

test("handles blank lines, CRLF line endings, and sequence whitespace", () => {
    expect(fasta("\n>A description\r\nA C\r\n\r\n>B\r\nG\tT\r\n")).toEqual([
        { identifier: "A", sequence: "AC" },
        { identifier: "B", sequence: "GT" },
    ]);
});

test("reports malformed input with a line number", () => {
    expect(() => fasta(">A\nAC\n>\nGT")).toThrow(
        "Invalid FASTA header on line 3: missing identifier"
    );
    expect(() => fasta("AC\n>A\nGT")).toThrow(
        "Invalid FASTA file on line 1: sequence data before the first header"
    );
});
