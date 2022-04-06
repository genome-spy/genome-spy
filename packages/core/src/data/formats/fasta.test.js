import { expect, test } from "vitest";
import fasta from "./fasta";

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
