import { TemplateResult } from "lit-html";
import Mark from "../../marks/mark";

/**
 * Converts a datum to tooltip (lit-html's TemplateResult).
 */
export type TooltipHandler = (
    datum: Record<string, any>,
    mark: Mark
) => Promise<TemplateResult>;
