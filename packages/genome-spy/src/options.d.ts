import { TooltipHandler } from "./utils/tooltip/tooltipHandler";

export interface EmbedOptions {
    /** If true, don't display the toolbar. */
    bare?: boolean;

    /** Custom tooltip handlers. Use "default" to override the default handler */
    tooltipHandlers?: Record<string, TooltipHandler>;
}
