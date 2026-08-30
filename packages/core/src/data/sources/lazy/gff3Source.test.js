import { parseLines } from "gff-nostream";
import { describe, expect, it } from "vitest";
import { adaptGff3Features } from "./gff3Source.js";

describe("adaptGff3Features", () => {
    it("adapts coordinates, strands, attributes, and nested features", () => {
        const features = adaptGff3Features(
            parseLines([
                "chr1\tsource\tgene\t101\t200\t.\t+\t.\tID=gene1;Name=Gene;Alias=a,b;start=attributeStart;chrom=attributeChrom;chrom2=existingChrom2",
                "chr1\tsource\tmRNA\t111\t190\t.\t-\t.\tID=tx1;Parent=gene1;gene_name=Gene",
                "chr1\tsource\texon\t121\t130\t.\t.\t.\tID=exon1;Parent=tx1;exon_number=1",
            ])
        );

        expect(features).toHaveLength(1);
        expect(features[0]).toMatchObject({
            chrom: "chr1",
            source: "source",
            type: "gene",
            start: 100,
            end: 200,
            strand: "+",
            id: "gene1",
            name: "Gene",
            alias: ["a", "b"],
            start2: "attributeStart",
            chrom2: "existingChrom2",
            chrom3: "attributeChrom",
        });

        const transcript = features[0].subfeatures[0];
        expect(transcript).toMatchObject({
            chrom: "chr1",
            start: 110,
            end: 190,
            strand: "-",
            id: "tx1",
            parent: "gene1",
            gene_name: "Gene",
        });
        expect(transcript.subfeatures[0]).toMatchObject({
            chrom: "chr1",
            start: 120,
            end: 130,
            strand: null,
            id: "exon1",
            parent: "tx1",
            exon_number: "1",
        });
        expect("refName" in features[0]).toBe(false);
    });

    it("preserves multi-parent identity without duplicate attachment", () => {
        const features = adaptGff3Features(
            parseLines([
                "chr1\t.\tgene\t1\t100\t.\t+\t.\tID=gene1",
                "chr1\t.\tgene\t201\t300\t.\t+\t.\tID=gene2",
                "chr1\t.\texon\t50\t60\t.\t+\t.\tID=shared;Parent=gene1,gene2",
                "chr1\t.\texon\t70\t80\t.\t+\t.\tID=once;Parent=gene1,gene1",
            ])
        );

        expect(features).toHaveLength(2);
        expect(features[0].subfeatures).toHaveLength(2);
        expect(features[1].subfeatures).toHaveLength(1);
        expect(features[0].subfeatures[0]).toBe(features[1].subfeatures[0]);
    });

    it("keeps orphan and multi-location features", () => {
        const features = adaptGff3Features(
            parseLines([
                "chr1\t.\tgene\t1\t100\t.\t+\t.\tID=gene1",
                "chr1\t.\tCDS\t10\t20\t.\t+\t0\tID=cds1;Parent=gene1",
                "chr1\t.\tCDS\t30\t40\t.\t+\t2\tID=cds1;Parent=gene1",
                "chr1\t.\texon\t50\t60\t.\t-\t.\tID=orphan;Parent=outside",
            ])
        );

        expect(features).toHaveLength(2);
        expect(features[0].subfeatures).toHaveLength(2);
        expect(features[0].subfeatures[0]).not.toBe(features[0].subfeatures[1]);
        expect(features[0].subfeatures.map((feature) => feature.phase)).toEqual(
            [0, 2]
        );
        expect(features[1]).toMatchObject({
            id: "orphan",
            parent: "outside",
            strand: "-",
        });
    });
});
