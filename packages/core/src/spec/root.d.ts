import { GenomeConfig } from "./genome.js";
import { ViewSpec } from "./view.js";

export type NamedGenomeConfig = Omit<GenomeConfig, "name">;

export interface RootConfig {
    $schema?: string;

    /**
     * Named genome assembly definitions.
     *
     * Each object key is the assembly name.
     */
    genomes?: Record<string, NamedGenomeConfig>;

    /**
     * Default assembly for locus scales that do not define `scale.assembly`.
     *
     * Can reference either a key in `genomes` or a built-in assembly name.
     */
    assembly?: string;

    /**
     * @deprecated Use `genomes` and `assembly` instead.
     */
    genome?: GenomeConfig;

    baseUrl?: string;

    /**
     * Background color of the canvas.
     */
    background?: string;

    /**
     * https://vega.github.io/vega-lite/docs/data.html#datasets
     */
    datasets?: Record<string, any[]>;
}

export type RootSpec = ViewSpec & RootConfig;
