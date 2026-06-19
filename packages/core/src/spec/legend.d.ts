import { Align, Baseline, FontStyle, FontWeight } from "./font.js";
import { ExprRef } from "./parameter.js";

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

// TODO: Consider adding more Vega/Vega-Lite legend properties when concrete
// use cases appear. Known gaps include tick controls (`tickCount`,
// `tickMinStep`), explicit legend `type`, gradient sizing/styling knobs
// (`gradientLength`, `gradientThickness`, `gradientOpacity`,
// `gradientStrokeColor`, `gradientStrokeWidth`), label overlap controls, and
// symbol override properties such as `symbolFillColor`, `symbolStrokeColor`,
// `symbolOpacity`, and `symbolLimit`.

/**
 * Legend properties. The initial legend surface is adapted from Vega:
 * https://github.com/vega/vega/
 */
export interface Legend {
    /**
     * Named style reference or references resolved from `config.style`. If an
     * array is provided, later styles override earlier ones. Set to `null` to
     * reset inherited legend styles.
     */
    style?: string | string[] | null;

    /**
     * Title text for the legend. If `null`, the title is removed.
     */
    title?: string | null;

    /**
     * The plot side or inside corner where the legend is placed. Side legends
     * are placed outside the plot area. Corner legends are placed inside the
     * plot area.
     */
    orient?: LegendOrient | ExprRef;

    /**
     * The direction in which legend entries are laid out.
     */
    direction?: LegendDirection;

    /**
     * External gap in pixels between the legend and the plot edge.
     */
    offset?: number;

    /**
     * Internal padding in pixels around the legend content and background.
     */
    padding?: number;

    /**
     * The number of columns in which to arrange symbol legend entries.
     */
    columns?: number;

    /**
     * Explicit values to show in the legend. For discrete symbol legends, the
     * values define an ordered subset of entries. For quantitative symbol and
     * gradient legends, the values define the shown representative values or
     * ticks.
     */
    values?: (string | number | boolean)[];

    /**
     * Maximum label text width in pixels.
     */
    labelLimit?: number;

    /**
     * Fill color of the legend background.
     */
    backgroundFill?: string;

    /**
     * Opacity of the legend background fill.
     */
    backgroundFillOpacity?: number;

    /**
     * Stroke color of the legend background.
     */
    backgroundStroke?: string;

    /**
     * Stroke width of the legend background border.
     */
    backgroundStrokeWidth?: number;

    /**
     * Opacity of the legend background stroke.
     */
    backgroundStrokeOpacity?: number;

    /**
     * Symbol size in pixels squared.
     */
    symbolSize?: number;

    /**
     * Symbol shape.
     */
    symbolType?: string;

    /**
     * The side of the legend on which to place the title.
     */
    titleOrient?: LegendTitleOrient;
}

/**
 * Legend defaults. The initial legend surface is adapted from Vega:
 * https://github.com/vega/vega/
 */
export interface LegendConfig extends Legend {
    /**
     * Disable automatic legend creation. Use `legend: null` on an encoding
     * channel to remove that channel's legend.
     *
     * __Default value:__ `false`
     */
    disable?: boolean | ExprRef;

    /**
     * Spacing in pixels between legends collected into the same legend region.
     */
    spacing?: number;

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
     * Padding in pixels between the legend title and the legend body.
     */
    titlePadding?: number;
}
