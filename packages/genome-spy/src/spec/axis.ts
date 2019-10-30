/*!
 * Adapted from
 * https://github.com/vega/vega/commits/master/packages/vega-typings/types/spec/axis.d.ts
 * 
 * Copyright (c) 2015-2018, University of Washington Interactive Data Lab
 * All rights reserved.
 * 
 * BSD-3-Clause License: https://github.com/vega/vega/blob/master/LICENSE
 */


export interface Axis extends BaseAxis {
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
     * The color of the axis's tick.
     *
     * __Default value:__ `"gray"`
     */
    tickColor?: C;

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

    labelPadding?: N;
}
