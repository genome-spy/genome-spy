export interface Contig {
    name: string;
    size: number;
}

export interface GenomeConfigBase {
    /**
     * Name of the genome assembly, e.g., `hg19` or `hg38`.
     */
    name: string;
}

export interface UrlGenomeConfig extends GenomeConfigBase {
    /**
     * A URL to a `chrom.sizes` file, which is a tab-separated file with two
     * columns: the sequence name and its size.
     *
     * You may want to strip alternative loci, haplotypes, and other
     * non-canonical contigs from the file.
     *
     * Example: `"https://genomespy.app/data/genomes/hg19/chrom.sizes"`
     */
    url: string;
}

export interface InlineGenomeConfig extends GenomeConfigBase {
    /**
     * An array of contigs/sequences in the genome assembly.
     */
    contigs: Contig[];
}

export type GenomeConfig =
    | UrlGenomeConfig
    | InlineGenomeConfig
    | GenomeConfigBase;

export interface ChromosomalLocus {
    /**
     * The name of the chromosome. For example: `"chr1"`, `"CHR1"`, or `"1"`.
     */
    chrom: string;

    /**
     * The zero-based position inside the chromosome or contig.
     */
    pos?: number;
}
