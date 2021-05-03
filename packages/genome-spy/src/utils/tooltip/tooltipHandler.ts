import { TemplateResult } from "lit";
import Mark from "../../marks/mark";

/**
 * Converts a datum to tooltip (lit's TemplateResult).
 */
export type TooltipHandler = (
    datum: Record<string, any>,
    mark: Mark
) => Promise<TemplateResult>;
