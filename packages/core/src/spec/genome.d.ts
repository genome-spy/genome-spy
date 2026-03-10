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

export interface UrlGenomeDefinition {
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

export interface InlineGenomeDefinition {
    /**
     * An array of contigs/sequences in the genome assembly.
     */
    contigs: Contig[];
}

/**
 * Genome definition for contexts where the name is provided externally
 * (for example, as a key in root `genomes`) or not needed
 * (for example, inline `scale.assembly`).
 */
export type GenomeDefinition = UrlGenomeDefinition | InlineGenomeDefinition;

/**
 * @deprecated Use `GenomeDefinition` in root `genomes` entries and `scale.assembly`.
 */
export type UrlGenomeConfig = GenomeConfigBase & UrlGenomeDefinition;

/**
 * @deprecated Use `GenomeDefinition` in root `genomes` entries and `scale.assembly`.
 */
export type InlineGenomeConfig = GenomeConfigBase & InlineGenomeDefinition;

/**
 * @deprecated Use root `genomes` and `assembly` instead of root `genome`.
 */
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
