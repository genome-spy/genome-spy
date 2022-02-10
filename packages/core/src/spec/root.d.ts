import { GenomeConfig } from "./genome";
import { ViewSpec } from "./view";

interface RootConfig {
    $schema?: string;

    genome?: GenomeConfig;

    baseUrl?: string;

    /**
     * https://vega.github.io/vega-lite/docs/data.html#datasets
     */
    datasets?: Record<string, any[]>;
}

export type RootSpec = ViewSpec & RootConfig;
