import { expect, test } from "vitest";
import { getContigs } from "./genomes.js";

test("getContigs", () => {
    expect(getContigs("mm10")[0]).toEqual({ name: "chr1", size: 195471971 });
    expect(getContigs("mm10")[5]).toEqual({ name: "chr6", size: 149736546 });
    expect(getContigs("hg38")[19]).toEqual({ name: "chr20", size: 64444167 });
});

test("hs1 provides T2T-CHM13v2.0 chromosomes in human chromosome order", () => {
    const contigs = getContigs("hs1");

    expect(contigs.map(({ name }) => name)).toEqual([
        ...Array.from({ length: 22 }, (_, index) => `chr${index + 1}`),
        "chrX",
        "chrY",
        "chrM",
    ]);
    expect(contigs[23].size).toBe(62_460_029);
});
