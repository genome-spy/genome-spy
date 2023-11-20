import { TemplateResult } from "lit-html";
import Mark from "../marks/mark.js";

/**
 * Converts a datum to tooltip (HTMLElement or lit's TemplateResult).
 */
export type TooltipHandler = (
    datum: Record<string, any>,
    mark: Mark,
    /** Optional parameters from the view specification */
    params?: Record<string, any>
) => Promise<string | TemplateResult | HTMLElement>;
