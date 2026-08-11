export interface HandledTooltip {
    handler: string;

    params?: Record<string, any>;
}

export type Tooltip = HandledTooltip | null | false;
