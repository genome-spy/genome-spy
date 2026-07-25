import { expect, test } from "vitest";
import vcf from "./vcf.js";

const header = `##fileformat=VCFv4.3
##INFO=<ID=SVTYPE,Number=1,Type=String,Description="Type">
##INFO=<ID=END,Number=1,Type=Integer,Description="End position">
##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">
##FORMAT=<ID=DP,Number=1,Type=Integer,Description="Read depth">
#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tTUMOR`;

test("parses VCF records and materializes samples", async () => {
    const data =
        header +
        "\r\nchr1\t101\tbnd1\tN\tN]chr2:202]\t60\tPASS\tSVTYPE=BND;END=101\tGT:DP\t0/1:12\r\n";

    const variants = await vcf(data);

    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({
        CHROM: "chr1",
        POS: 101,
        ID: ["bnd1"],
        REF: "N",
        ALT: ["N]chr2:202]"],
        QUAL: 60,
        FILTER: "PASS",
        INFO: {
            SVTYPE: ["BND"],
            END: [101],
        },
        FORMAT: "GT:DP",
        SAMPLES: {
            TUMOR: {
                GT: ["0/1"],
                DP: [12],
            },
        },
    });
});

test("accepts a header-only VCF", async () => {
    expect(await vcf(header + "\n")).toEqual([]);
});

test("reports the source line for malformed records", async () => {
    await expect(vcf(header + "\nchr1\t101")).rejects.toThrow(
        "Cannot parse VCF line 7"
    );
});
