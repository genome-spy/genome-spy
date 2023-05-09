import { Align, Baseline, FontStyle, FontWeight } from "./font";

export interface GenomeAxis extends Axis {
    chromTicks?: boolean;
    chromTickSize?: number;
    chromTickWidth?: number;
    chromTickColor?: string;
    chromTickDash?: number[];
    chromTickDashOffset?: number;

    chromLabels?: boolean;
    chromLabelFont?: string;
    chromLabelFontSize?: number;
    chromLabelFontWeight?: FontWeight;
    chromLabelFontStyle?: FontStyle;
    chromLabelColor?: string;
    chromLabelPadding?: number;
    chromLabelAlign?: Align;
    // TODO: chromLabelPerpendicularPadding

    /**
     * A boolean flag indicating if chromosome grid lines should be included as part of the axis.
     *
     * __Default value:__ `false`
     */
    chromGrid?: boolean;

    /**
     * Color of grid lines.
     *
     * __Default value:__ `lightgray`
     */
    chromGridColor?: string;

    /**
     * The stroke cap for the chromosome grid line's ending style. One of `"butt"`, `"round"` or `"square"`.
     *
     * __Default value:__ `"butt"`
     */
    chromGridCap?: "butt" | "round" | "square";

    /**
     * An array of alternating [stroke, space] lengths for dashed chromosome grid mark lines.
     */

    chromGridDash?: number[];

    /**
     * The pixel offset at which to start drawing with the chromosome grid mark dash array.
     */
    chromGridDashOffset?: number;

    /**
     * The opacity of the chromosome grid lines.
     *
     * __Default value:__ `1`
     */
    chromGridOpacity?: number;

    /**
     * Width of the chromosome grid lines.
     *
     * __Default value:__ `1`
     */
    chromGridWidth?: number;

    /**
     * Fill color of odd chromosomes.
     *
     * __Default value:__ (none)
     */
    chromGridFillOdd?: string;

    /**
     * Fill color of odd chromosomes.
     *
     * __Default value:__ (none)
     */
    chromGridFillEven?: string;
}

/*!
 * Adapted from
 * https://github.com/vega/vega/blob/master/packages/vega-typings/types/spec/axis.d.ts
 *
 * Copyright (c) 2015-2018, University of Washington Interactive Data Lab
 * All rights reserved.
 *
 * BSD-3-Clause License: https://github.com/vega/vega/blob/master/LICENSE
 */

export type AxisOrient = "top" | "bottom" | "left" | "right";

export interface Axis extends BaseAxis {
    /**
     * The orientation of the axis. One of `"top"`, `"bottom"`, `"left"` or `"right"`. The orientation can be used to further specialize the axis type (e.g., a y axis oriented for the right edge of the chart).
     *
     * __Default value:__ `"bottom"` for x-axes and `"left"` for y-axes.
     */
    orient?: AxisOrient;

    /**
     * The format specifier pattern for axis labels.
     * Must be a legal [d3-format](https://github.com/d3/d3-format#locale_format) specifier.
     */
    format?: string;

    /**
     * A title for the axis (none by default).
     */
    title?: string;

    /**
     * The orthogonal offset in pixels by which to displace the axis from its position along the edge of the chart.
     */
    offset?: number;

    /**
     * A desired number of ticks, for axes visualizing quantitative scales. The resulting number may be different so that values are "nice" (multiples of `2`, `5`, `10`) and lie within the underlying scale's range.
     *
     * @minimum 0
     */
    tickCount?: number;

    /**
     * The minimum desired step between axis ticks, in terms of scale domain values. For example, a value of `1` indicates that ticks should not be less than 1 unit apart. If `tickMinStep` is specified, the `tickCount` value will be adjusted, if necessary, to enforce the minimum step value.
     */
    tickMinStep?: number;

    /**
     * Explicitly set the visible axis tick and label values.
     */
    values?: any[];
}

export interface BaseAxis<
    N = number,
    NS = number,
    B = boolean,
    BNS = number | boolean,
    S = string,
    C = string,
    FW = string,
    FS = string
> {
    /**
     * The minimum extent in pixels that axis ticks and labels should use. This determines a minimum offset value for axis titles.
     *
     * __Default value:__ `30` for y-axis; `undefined` for x-axis.
     */
    minExtent?: N;

    /**
     * The maximum extent in pixels that axis ticks and labels should use. This determines a maximum offset value for axis titles.
     *
     * __Default value:__ `undefined`.
     */
    maxExtent?: N;

    // ---------- Title ----------
    /**
     * The padding, in pixels, between title and axis.
     */
    titlePadding?: N;

    /**
     * Color of the title, can be in hex color code or regular color name.
     */
    titleColor?: C;

    /**
     * Font of the title. (e.g., `"Helvetica Neue"`).
     */
    titleFont?: S;

    /**
     * Font size of the title.
     *
     * @minimum 0
     */
    titleFontSize?: N;

    /**
     * Font style of the title.
     */
    titleFontStyle?: FS;

    /**
     * Font weight of the title.
     * This can be either a string (e.g `"bold"`, `"normal"`) or a number (`100`, `200`, `300`, ..., `900` where `"normal"` = `400` and `"bold"` = `700`).
     */
    titleFontWeight?: FW;

    /**
     * Opacity of the axis title.
     */
    titleOpacity?: N;

    // ---------- Domain ----------
    /**
     * A boolean flag indicating if the domain (the axis baseline) should be included as part of the axis.
     *
     * __Default value:__ `true`
     */
    domain?: boolean;

    /**
     * The stroke cap for the domain line's ending style. One of `"butt"`, `"round"` or `"square"`.
     *
     * __Default value:__ `"butt"`
     */
    domainCap?: "butt" | "round" | "square";

    /**
     * An array of alternating [stroke, space] lengths for dashed domain lines.
     */
    domainDash?: number[];

    /**
     * The pixel offset at which to start drawing with the domain dash array.
     */
    domainDashOffset?: number;

    /**
     * Color of axis domain line.
     *
     * __Default value:__ `"gray"`.
     */
    domainColor?: C;

    /**
     * Stroke width of axis domain line
     *
     * __Default value:__ `1`
     */
    domainWidth?: N;

    // ---------- Ticks ----------
    /**
     * Boolean value that determines whether the axis should include ticks.
     *
     * __Default value:__ `true`
     */
    ticks?: B;

    /**
     * The stroke cap for the tick lines' ending style. One of `"butt"`, `"round"` or `"square"`.
     *
     * __Default value:__ `"butt"`
     */
    tickCap?: "butt" | "round" | "square";

    /**
     * The color of the axis's tick.
     *
     * __Default value:__ `"gray"`
     */
    tickColor?: C;

    /**
     * An array of alternating [stroke, space] lengths for dashed tick mark lines.
     */
    tickDash?: number[];

    /**
     * The pixel offset at which to start drawing with the tick mark dash array.
     */
    tickDashOffset?: number;

    /**
     * The size in pixels of axis ticks.
     *
     * __Default value:__ `5`
     * @minimum 0
     */
    tickSize?: N;

    /**
     * The width, in pixels, of ticks.
     *
     * __Default value:__ `1`
     * @minimum 0
     */
    tickWidth?: N;

    // ---------- Labels ----------
    /**
     * A boolean flag indicating if labels should be included as part of the axis.
     *
     * __Default value:__ `true`.
     */
    labels?: boolean;

    /**
     * Horizontal text alignment of axis tick labels, overriding the default setting for the current axis orientation.
     */
    labelAlign?: Align;

    /**
     * The rotation angle of the axis labels.
     *
     * __Default value:__ `-90` for nominal and ordinal fields; `0` otherwise.
     *
     * @minimum -360
     * @maximum 360
     */
    labelAngle?: number;

    /**
     * Vertical text baseline of axis tick labels, overriding the default setting for the current axis orientation.
     * One of `"alphabetic"` (default), `"top"`, `"middle"`, `"bottom"`.
     */
    labelBaseline?: Baseline;

    /**
     * The color of the tick label, can be in hex color code or regular color name.
     */
    labelColor?: C;

    /**
     * The font of the tick label.
     */
    labelFont?: S;

    /**
     * The font size of the label, in pixels.
     *
     * @minimum 0
     */
    labelFontSize?: N;

    /**
     * Font style of the title.
     */
    labelFontStyle?: FS;

    /**
     * Font weight of axis tick labels.
     */
    labelFontWeight?: FW;

    /**
     * Maximum allowed pixel width of axis tick labels.
     *
     * __Default value:__ `180`
     */
    labelLimit?: N;

    /**
     * The padding, in pixels, between axis and text labels.
     *
     * __Default value:__ `2`
     */

    labelPadding?: number;

    /**
     * A boolean flag indicating if grid lines should be included as part of the axis.
     *
     * __Default value:__ `false`
     */
    grid?: boolean;

    /**
     * Color of grid lines.
     *
     * __Default value:__ `lightgray`
     */
    gridColor?: string;

    /**
     * The stroke cap for the grid line's ending style. One of `"butt"`, `"round"` or `"square"`.
     *
     * __Default value:__ `"butt"`
     */
    gridCap?: "butt" | "round" | "square";

    /**
     * An array of alternating [stroke, space] lengths for dashed grid mark lines.
     */

    gridDash?: number[];

    /**
     * The pixel offset at which to start drawing with the grid mark dash array.
     */
    gridDashOffset?: number;

    /**
     * The opacity of the grid lines.
     *
     * __Default value:__ `1`
     */
    gridOpacity?: number;

    /**
     * Width of the grid lines.
     *
     * __Default value:__ `1`
     */
    gridWidth?: number;
}
