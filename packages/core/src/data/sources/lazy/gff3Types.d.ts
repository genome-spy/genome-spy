export type Gff3Strand = "+" | "-" | null;

/** A GFF3 feature after adaptation to GenomeSpy's public source contract. */
export interface Gff3FeatureDatum {
    chrom: string;
    source: string | null;
    type: string | null;
    start: number;
    end: number;
    score?: number;
    strand: Gff3Strand;
    phase?: number;
    subfeatures: Gff3FeatureDatum[];
    [key: string]: unknown;
}
