import { Align, Baseline, FontStyle, FontWeight } from "./font.js";

export type LegendOrient =
    | "left"
    | "right"
    | "top"
    | "bottom"
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right";

export type LegendDirection = "vertical" | "horizontal";

export type LegendTitleOrient = "top" | "bottom" | "left" | "right";

/**
 * Legend properties. The initial legend surface is adapted from Vega:
 * https://github.com/vega/vega/
 */
export interface Legend {
    /**
     * Title text for the legend. If `null`, the title is removed.
     */
    title?: string | null;

    /**
     * The plot side or inside corner where the legend is placed.
     */
    orient?: LegendOrient;

    /**
     * The direction in which legend entries are laid out.
     */
    direction?: LegendDirection;

    /**
     * The number of columns in which to arrange symbol legend entries.
     */
    columns?: number;

    /**
     * Maximum label text width in pixels.
     */
    labelLimit?: number;

    /**
     * Symbol size in pixels squared.
     */
    symbolSize?: number;

    /**
     * Symbol shape.
     */
    symbolType?: string;
}

/**
 * Legend defaults. The initial legend surface is adapted from Vega:
 * https://github.com/vega/vega/
 */
export interface LegendConfig extends Legend {
    /**
     * Disable legends by default.
     */
    disable?: boolean;

    /**
     * Padding around the legend content in pixels.
     */
    padding?: number;

    /**
     * Padding between legend rows in pixels.
     */
    rowPadding?: number;

    /**
     * Padding between legend columns in pixels.
     */
    columnPadding?: number;

    /**
     * Horizontal alignment of legend labels.
     */
    labelAlign?: Align;

    /**
     * Baseline alignment of legend labels.
     */
    labelBaseline?: Baseline;

    /**
     * Legend label color.
     */
    labelColor?: string;

    /**
     * Legend label font.
     */
    labelFont?: string;

    /**
     * Legend label font size in pixels.
     */
    labelFontSize?: number;

    /**
     * Legend label font style.
     */
    labelFontStyle?: FontStyle;

    /**
     * Legend label font weight.
     */
    labelFontWeight?: FontWeight;

    /**
     * Offset between legend symbols and labels in pixels.
     */
    labelOffset?: number;

    /**
     * Offset applied to legend symbols in pixels.
     */
    symbolOffset?: number;

    /**
     * Legend symbol stroke width in pixels.
     */
    symbolStrokeWidth?: number;

    /**
     * Base fill color for legend symbols when the legend does not encode fill.
     */
    symbolBaseFillColor?: string;

    /**
     * Base stroke color for legend symbols when the legend does not encode stroke.
     */
    symbolBaseStrokeColor?: string;

    /**
     * Legend title color.
     */
    titleColor?: string;

    /**
     * Legend title font.
     */
    titleFont?: string;

    /**
     * Legend title font size in pixels.
     */
    titleFontSize?: number;

    /**
     * Legend title font style.
     */
    titleFontStyle?: FontStyle;

    /**
     * Legend title font weight.
     */
    titleFontWeight?: FontWeight;

    /**
     * Maximum title text width in pixels.
     */
    titleLimit?: number;

    /**
     * The side of the legend on which to place the title.
     */
    titleOrient?: LegendTitleOrient;

    /**
     * Padding between the legend title and entries in pixels.
     */
    titlePadding?: number;
}
