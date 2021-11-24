import { TooltipHandler } from "./tooltip/tooltipHandler";

export interface EmbedOptions {
    /**
     * A function that allows retrieval of named data sources.
     *
     * TODO: Support dynamic updates, i.e., pushing new data.
     */
    namedDataProvider?: (name: string) => any[];

    /**
     * Custom tooltip handlers. Use "default" to override the default handler
     */
    tooltipHandlers?: Record<string, TooltipHandler>;
}
