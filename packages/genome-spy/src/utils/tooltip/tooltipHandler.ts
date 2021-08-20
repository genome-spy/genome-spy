import { TemplateResult } from "lit";
import Mark from "../../marks/mark";

/**
 * Converts a datum to tooltip (lit's TemplateResult).
 */
export type TooltipHandler = (
    datum: Record<string, any>,
    mark: Mark,
    /** Optional parameters from the view specification */
    params?: Record<string, any>
) => Promise<TemplateResult>;
