import { GenomeConfig } from "./genome.js";
import { BuiltInThemeName, GenomeSpyConfig } from "./config.js";
import { ViewSpec } from "./view.js";

export interface RootConfig {
    $schema?: string;

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

    /**
     * Global configuration defaults and theme tokens.
     *
     * The configuration is inherited by descendant views and can be overridden
     * by view-local `config` objects.
     */
    config?: GenomeSpyConfig;

    /**
     * Selects built-in theme preset(s) for the whole visualization.
     */
    theme?: BuiltInThemeName | BuiltInThemeName[];
}

export type RootSpec = ViewSpec & RootConfig;
