/*!
 * Adapted from
 * https://github.com/vega/vega/blob/main/packages/vega-typings/types/spec/title.d.ts
 *
 * Copyright (c) 2015-2018, University of Washington Interactive Data Lab
 * All rights reserved.
 *
 * BSD-3-Clause License: https://github.com/vega/vega-lite/blob/master/LICENSE
 */

import { Align, Baseline, FontStyle, FontWeight } from "./font.js";
import { ExprRef } from "./parameter.js";
import { ZIndexProps } from "./decoration.js";

export type TitleOrient = "none" | "left" | "right" | "top" | "bottom";
export type TitleAnchor = null | "start" | "middle" | "end";
export type TitleFrame = "bounds" | "group";

export interface Title extends ZIndexProps {
    /**
     * The title text.
     */
    text: string | ExprRef;

    /**
     * The subtitle text.
     */
    subtitle?: string | ExprRef;

    /**
     * A mark style property to apply to the title text mark. If not specified, a default style of `"group-title"` is applied.
     */
    style?: string | string[];

    /**
     * The anchor position for placing the title and subtitle text. One of `"start"`, `"middle"`, or `"end"`. For example, with an orientation of top these anchor positions map to a left-, center-, or right-aligned title.
     */
    anchor?: TitleAnchor;

    /**
     * The reference frame for the title anchor. `"group"` anchors the title
     * along the plot area. `"bounds"` anchors the title along the full bounds,
     * including axes, legends, and other reserved space.
     *
     * __Default value:__ `"group"`
     */
    frame?: TitleFrame;

    /**
     * The orthogonal offset in pixels by which to displace the title group from its position along the edge of the chart.
     */
    offset?: number;

    /**
     * Whether the title reserves layout space outside the plot area. Reserved
     * titles are placed outside axes, legends, and other guide space on the same
     * side.
     *
     * Setting this to `false` lets the title render without affecting layout,
     * enabling wilder layouts where titles may overlap nearby content.
     *
     * __Default value:__ `true`
     */
    reserve?: boolean;

    /**
     * Z-order of the title relative to the view content.
     *
     * Values greater than `0` render after the view marks. Values less than or
     * equal to `0` render before the marks.
     *
     * __Default value:__ `1`
     */
    zindex?: number;

    /**
     * Default title orientation (`"none"`, `"top"`, `"bottom"`, `"left"`, or `"right"`)
     */
    orient?: TitleOrient;

    // ---------- Shared Text Properties ----------
    /**
     * Horizontal text alignment for title text. One of `"left"`, `"center"`, or `"right"`.
     */
    align?: Align;

    /**
     * Angle in degrees of title and subtitle text.
     */
    angle?: number | ExprRef;

    /**
     * Vertical text baseline for title and subtitle text. One of `"alphabetic"` (default), `"top"`, `"middle"`, or `"bottom"`.
     */
    baseline?: Baseline;

    /**
     * Delta offset for title and subtitle text x-coordinate.
     */
    dx?: number;

    /**
     * Delta offset for title and subtitle text y-coordinate.
     */
    dy?: number;

    // ---------- Title Text ----------
    /**
     * Text color for title text.
     */
    color?: string | ExprRef;

    /**
     * Font name for title text.
     */
    font?: string;

    /**
     * Font size in pixels for title text.
     *
     * @minimum 0
     */
    fontSize?: number | ExprRef;

    /**
     * Font style for title text.
     */
    fontStyle?: FontStyle;

    /**
     * Font weight for title text.
     * This can be either a string (e.g `"bold"`, `"normal"`) or a number (`100`, `200`, `300`, ..., `900` where `"normal"` = `400` and `"bold"` = `700`).
     */
    fontWeight?: FontWeight;

    // ---------- Subtitle Text ----------
    /**
     * Text color for subtitle text.
     */
    subtitleColor?: string | ExprRef;

    /**
     * Font name for subtitle text.
     */
    subtitleFont?: string;

    /**
     * Font size in pixels for subtitle text.
     *
     * @minimum 0
     */
    subtitleFontSize?: number | ExprRef;

    /**
     * Font style for subtitle text.
     */
    subtitleFontStyle?: FontStyle;

    /**
     * Font weight for subtitle text.
     * This can be either a string (e.g `"bold"`, `"normal"`) or a number (`100`, `200`, `300`, ..., `900` where `"normal"` = `400` and `"bold"` = `700`).
     */
    subtitleFontWeight?: FontWeight;

    /**
     * Padding in pixels between title and subtitle text.
     *
     * __Default value:__ `3`
     */
    subtitlePadding?: number;
}
