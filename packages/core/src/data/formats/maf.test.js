import { expect, test } from "vitest";
import { formats as vegaFormats, read } from "vega-loader";
import maf from "./maf.js";

vegaFormats("maf", maf);

test("parses MAF rows and ignores meta/comment lines", () => {
    const data = `#version 2.4
Hugo_Symbol\tChromosome\tStart_Position\tEnd_Position\tReference_Allele\tTumor_Seq_Allele2\tTumor_Sample_Barcode\tVariant_Classification
TP53\tchr17\t7579472\t7579472\tC\tT\tSAMPLE-1\tMissense_Mutation`;

    expect(maf(data)).toEqual([
        {
            Hugo_Symbol: "TP53",
            Chromosome: "chr17",
            Start_Position: 7579472,
            End_Position: 7579472,
            Reference_Allele: "C",
            Tumor_Seq_Allele2: "T",
            Tumor_Sample_Barcode: "SAMPLE-1",
            Variant_Classification: "Missense_Mutation",
            chrom: "chr17",
            start: 7579471,
            end: 7579472,
            sample: "SAMPLE-1",
        },
    ]);
});

test("parses headerless MAF with explicit columns", () => {
    const data =
        "TP53\tchr17\t7579472\t7579472\tC\tT\tSAMPLE-1\tMissense_Mutation";

    expect(
        maf(data, {
            columns: [
                "Hugo_Symbol",
                "Chromosome",
                "Start_Position",
                "End_Position",
                "Reference_Allele",
                "Tumor_Seq_Allele2",
                "Tumor_Sample_Barcode",
                "Variant_Classification",
            ],
        })
    ).toEqual([
        {
            Hugo_Symbol: "TP53",
            Chromosome: "chr17",
            Start_Position: 7579472,
            End_Position: 7579472,
            Reference_Allele: "C",
            Tumor_Seq_Allele2: "T",
            Tumor_Sample_Barcode: "SAMPLE-1",
            Variant_Classification: "Missense_Mutation",
            chrom: "chr17",
            start: 7579471,
            end: 7579472,
            sample: "SAMPLE-1",
        },
    ]);
});

test("fails when required columns are missing", () => {
    const data = `Hugo_Symbol\tChromosome\tStart_Position\tEnd_Position\tReference_Allele\tTumor_Seq_Allele2
TP53\tchr17\t7579472\t7579472\tC\tT`;

    expect(() => maf(data)).toThrow(
        'MAF input is missing a required column for "Tumor_Sample_Barcode".'
    );
});

test("fails when shorthand aliases are used instead of required MAF headers", () => {
    const data = `Hugo_Symbol\tchrom\tstart\tend\tref\talt\tsample
TP53\tchr17\t7579472\t7579472\tC\tT\tSAMPLE-1`;

    expect(() => maf(data)).toThrow(
        'MAF input is missing a required column for "Chromosome".'
    );
});

test("fails on invalid coordinates", () => {
    const data = `Hugo_Symbol\tChromosome\tStart_Position\tEnd_Position\tReference_Allele\tTumor_Seq_Allele2\tTumor_Sample_Barcode
TP53\tchr17\t0\t1\tC\tT\tSAMPLE-1`;

    expect(() => maf(data)).toThrow(
        "MAF line 2 has an invalid start coordinate: 0"
    );
});

test("supports explicit parse mapping through vega-loader", () => {
    const data = `Hugo_Symbol\tChromosome\tStart_Position\tEnd_Position\tReference_Allele\tTumor_Seq_Allele2\tTumor_Sample_Barcode\tt_alt_count
TP53\tchr17\t7579472\t7579472\tC\tT\tSAMPLE-1\t11`;

    expect(
        read(data, {
            type: "maf",
            parse: {
                t_alt_count: "number",
            },
        })
    ).toEqual([
        {
            Hugo_Symbol: "TP53",
            Chromosome: "chr17",
            Start_Position: 7579472,
            End_Position: 7579472,
            Reference_Allele: "C",
            Tumor_Seq_Allele2: "T",
            Tumor_Sample_Barcode: "SAMPLE-1",
            t_alt_count: 11,
            chrom: "chr17",
            start: 7579471,
            end: 7579472,
            sample: "SAMPLE-1",
        },
    ]);
});
