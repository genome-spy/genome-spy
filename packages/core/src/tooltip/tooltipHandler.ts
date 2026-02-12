import { TemplateResult } from "lit";
import Mark from "../marks/mark.js";

export type TooltipGenomicDisplayMode =
    | "auto"
    | "locus"
    | "interval"
    | "endpoints"
    | "disabled";

export interface TooltipGenomicAxisConfig {
    mode?: TooltipGenomicDisplayMode;
}

export interface TooltipHandlerParams {
    genomicCoordinates?: Partial<
        Record<"x" | "y", TooltipGenomicAxisConfig | TooltipGenomicDisplayMode>
    >;
    [key: string]: any;
}

export interface TooltipRow {
    key: string;
    value: any;
}

export interface TooltipContext {
    /**
     * A list of row keys that should be hidden from the default tooltip table.
     */
    hiddenRowKeys?: string[];

    /**
     * Derived genomic rows to render before raw data rows.
     */
    genomicRows?: TooltipRow[];

    /**
     * Utility for flattening datum fields into tooltip rows.
     */
    flattenDatumRows?: () => TooltipRow[];

    /**
     * Utility for formatting a continuous genomic position.
     */
    formatGenomicLocus?: (
        axis: "x" | "y",
        continuousPos: number
    ) => string | undefined;

    /**
     * Utility for formatting a continuous genomic interval.
     */
    formatGenomicInterval?: (
        axis: "x" | "y",
        interval: [number, number]
    ) => string | undefined;
}

/**
 * Converts a datum to tooltip (HTMLElement or lit's TemplateResult).
 *
 * TODO: `mark` leaks internals. Keep it for compatibility in this major
 * version and replace with a stable tooltip context in the next major.
 */
export type TooltipHandler = (
    datum: Record<string, any>,
    mark: Mark,
    /** Optional parameters from the view specification */
    params?: TooltipHandlerParams,
    /** Optional precomputed context from GenomeSpy internals */
    context?: TooltipContext
) => Promise<string | TemplateResult | HTMLElement>;
