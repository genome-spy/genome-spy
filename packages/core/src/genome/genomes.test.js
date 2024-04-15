import { expect, test } from "vitest";
import { getContigs } from "./genomes.js";

test("getContigs", () => {
    expect(getContigs("mm10")[0]).toEqual({ name: "chr1", size: 195471971 });
    expect(getContigs("mm10")[5]).toEqual({ name: "chr6", size: 149736546 });
    expect(getContigs("hg38")[19]).toEqual({ name: "chr20", size: 64444167 });
});
