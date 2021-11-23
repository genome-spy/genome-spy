import { GenomeConfig } from "./genome";
import { ViewSpec } from "./view";

export interface RootConfig {
    genome?: GenomeConfig;

    /**
     * A unique identifier that is used in storing state bookmarks to browser's
     * IndexedDB. This is needed to make distinction between visualizations that
     * are served from the same origin, i.e., the same host and port.
     */
    specId?: string;

    baseUrl?: string;

    /**
     * https://vega.github.io/vega-lite/docs/data.html#datasets
     */
    datasets?: Record<string, any[]>;
}

export type RootSpec = ViewSpec & RootConfig;
