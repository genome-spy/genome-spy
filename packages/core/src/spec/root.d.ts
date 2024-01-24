import { GenomeConfig } from "./genome.js";
import { VariableParameter } from "./parameter.js";
import { ViewSpec } from "./view.js";

interface RootConfig {
    $schema?: string;

    genome?: GenomeConfig;

    baseUrl?: string;

    /**
     * Background color of the canvas.
     */
    background?: string;

    /**
     * Dynamic variables that parameterize a visualization.
     */
    params?: VariableParameter[];

    /**
     * https://vega.github.io/vega-lite/docs/data.html#datasets
     */
    datasets?: Record<string, any[]>;
}

export type RootSpec = ViewSpec & RootConfig;
