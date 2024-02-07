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

export type TitleOrient = "none" | "left" | "right" | "top" | "bottom";
export type TitleAnchor = null | "start" | "middle" | "end";
export type TitleFrame = "bounds" | "group";

export interface Title {
    /**
     * The title text.
     */
    text: string | ExprRef;

    /**
     * A mark style property to apply to the title text mark. If not specified, a default style of `"group-title"` is applied.
     */
    style?: string;

    /**
     * The anchor position for placing the title and subtitle text. One of `"start"`, `"middle"`, or `"end"`. For example, with an orientation of top these anchor positions map to a left-, center-, or right-aligned title.
     */
    anchor?: TitleAnchor;

    /**
     * The reference frame for the anchor position, one of `"bounds"` (to anchor relative to the full bounding box) or `"group"` (to anchor relative to the group width or height).
     */
    frame?: TitleFrame;

    /**
     * The orthogonal offset in pixels by which to displace the title group from its position along the edge of the chart.
     */
    offset?: number;

    /**
     * Default title orientation (`"top"`, `"bottom"`, `"left"`, or `"right"`)
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
    angle?: number;

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
    color?: string;

    /**
     * Font name for title text.
     */
    font?: string;

    /**
     * Font size in pixels for title text.
     *
     * @minimum 0
     */
    fontSize?: number;

    /**
     * Font style for title text.
     */
    fontStyle?: FontStyle;

    /**
     * Font weight for title text.
     * This can be either a string (e.g `"bold"`, `"normal"`) or a number (`100`, `200`, `300`, ..., `900` where `"normal"` = `400` and `"bold"` = `700`).
     */
    fontWeight?: FontWeight;
}
