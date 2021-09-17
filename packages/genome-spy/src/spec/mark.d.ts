import { Align, Baseline, FontStyle, FontWeight } from "./font";
import { Tooltip } from "./tooltip";

export type MarkType = "rect" | "point" | "rule" | "text" | "link";

export interface FillAndStrokeProps {
    fill?: string;
    fillOpacity?: number;

    stroke?: string;
    strokeOpacity?: number;
}

export interface RectProps {
    // TODO: Rename to minCompensatedOpacity or something like that
    minOpacity?: number;

    minWidth?: number;
    minHeight?: number;

    cornerRadius?: number;
    cornerRadiusTopLeft?: number;
    cornerRadiusTopRight?: number;
    cornerRadiusBottomLeft?: number;
    cornerRadiusBottomRight?: number;
}

export interface TextProps {
    font?: string;
    fontStyle?: FontStyle;
    fontWeight?: FontWeight;
    align?: Align;
    baseline?: Baseline;
    dx?: number;
    dy?: number;
    fitToBand?: boolean;
    angle?: number;
    paddingX?: number;
    paddingY?: number;
    flushX?: boolean;
    flushY?: boolean;

    /**
     * If the `squeeze` property is true and secondary positional channels (`x2` and/or `y2`)
     * are used, the text is scaled to fit mark's width and/or height.
     *
     * **Default value:** `true`
     */
    squeeze?: boolean;

    /**
     * Stretch letters so that they can be used with sequence logos etc...
     */
    logoLetters?: boolean;

    viewportEdgeFadeWidth?: number[];
    viewportEdgeFadeDistance?: number[];
}

// TODO: Mark-specific configs
export interface MarkConfig extends RectProps, TextProps, FillAndStrokeProps {
    // Channels.
    x?: number;
    x2?: number;
    y?: number;
    y2?: number;
    color?: string;
    color2?: string;
    opacity?: number;
    size?: number;
    size2?: number;

    /**
     * One of `"circle"`, `"square"`, `"cross"`, `"diamond"`, `"triangle-up"`,
     * `"triangle-down"`, `"triangle-right"`, or `"triangle-left"`.
     *
     * **Default value:** `"circle"`
     */
    shape?: string;
    text?: string;

    /** Whether the `color` represents the `fill` color (`true`) or the `stroke` color (`false`) */
    filled?: boolean;

    /** Should the mark be clipped to the UnitView's rectangle.  */
    clip?: boolean;
    xOffset?: number;
    yOffset?: number;

    tooltip?: Tooltip;

    // Rule related stuff.
    minLength?: number;
    strokeDash?: number[];
    strokeDashOffset?: number;
    strokeCap?: "butt" | "square" | "round";

    // Point related stuff.

    /**
     * Should the stroke only grow inwards, e.g, the diameter/outline is not affected by the stroke width.
     * Thus, a point that has a zero size has no visible stroke. This allows strokes to be used with
     * geometric zoom, etc.
     *
     * **Default value:** `false`
     */
    inwardStroke?: boolean;
    strokeWidth?: number;

    /**
     * Gradient strength controls the amount of the gradient eye-candy effect in the fill color.
     * Valid values are between 0 and 1.
     *
     * **Default value:** `0`
     */
    fillGradientStrength?: number;

    // Link related stuff

    /**
     * Number of segments in the bézier curve. Affects the rendering quality and speed.
     *
     * **Default value:* `101`
     */
    segments?: number;

    /**
     * Padding between sample facet's upper/lower edge and the maximum point size. This property
     * controls how tightly points are squeezed when facet's height is smaller than the maximum
     * point size. The unit is a proportion of facet's height. The value must be between `0`
     * and `0.5`. This property has no effect when sample faceting is not used.
     *
     * **Default value:** `0.1`
     */
    sampleFacetPadding?: number;

    semanticZoomFraction?: number;

    /**
     * Enables geometric zooming. The value is the base two logarithmic zoom level where the maximum
     * point size is reached.
     *
     * **Default value:** `0`
     */
    geometricZoomBound?: number;

    // TODO: get rid of this
    dynamicData?: boolean;

    /**
     * Minimum size for WebGL buffers (number of data items).
     * Allows for using bufferSubData to update graphics.
     * This property is intended for internal usage.
     */
    minBufferSize?: number;

    /**
     * Builds and index for efficient rendering of subsets of the data.
     * The data must be sorted by the x coordinate.
     *
     * TODO: This should be enabled automatically if the data are sorted.
     */
    buildIndex?: boolean;
}

export interface MarkConfigAndType extends MarkConfig {
    type: MarkType;
}
