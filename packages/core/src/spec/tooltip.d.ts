export interface HandledTooltip {
    handler: string;

    params?: Record<string, any>;
}

// TODO: Encoding / data: https://vega.github.io/vega-lite/docs/tooltip.html#encoding

export type Tooltip = HandledTooltip | null;
