import { Scalar } from "./channel";
import { Align, Baseline, FontStyle, FontWeight } from "./font";
import { Tooltip } from "./tooltip";

export type MarkType = "rect" | "point" | "rule" | "text" | "link";

export interface FillAndStrokeProps {
    /** The fill color */
    fill?: string;

    /** The fill opacity. Value between [0, 1]. */
    fillOpacity?: number;

    /** The stroke color */
    stroke?: string;

    /** The stroke opacity. Value between [0, 1]. */
    strokeOpacity?: number;
}

export interface SecondaryPositionProps {
    x2?: number;
    y2?: number;
}

export interface AngleProps {
    /**
     * The rotation angle in degrees.
     *
     * **Default value:** `0`
     */
    angle?: number;
}

/**
 * Specifies how mark should be faded at the viewport edges.
 * This is mainly used to make axis labels pretty.
 */
export interface ViewportEdgeFadeProps {
    viewportEdgeFadeWidthTop?: number;
    viewportEdgeFadeWidthRight?: number;
    viewportEdgeFadeWidthBottom?: number;
    viewportEdgeFadeWidthLeft?: number;

    viewportEdgeFadeDistanceTop?: number;
    viewportEdgeFadeDistanceRight?: number;
    viewportEdgeFadeDistanceBottom?: number;
    viewportEdgeFadeDistanceLeft?: number;
}

export interface RectProps extends SecondaryPositionProps {
    /**
     * Clamps the minimum size-dependent opacity. The property does not affect the
     * `opacity` channel. Valid values are between `0` and `1`.
     *
     * When a rectangle would be smaller than what is specified in `minHeight` and
     * `minWidth`, it is faded out proportionally. Example: a rectangle would be
     * rendered as one pixel wide, but `minWidth` clamps it to five pixels. The
     * rectangle is actually rendered as five pixels wide, but its opacity is
     * multiplied by 0.2. With this setting, you can limit the factor to, for
     * example, 0.5 to keep the rectangles more clearly visible.
     *
     * **Default value:** `0`
     */
    // TODO: Rename to minCompensatedOpacity or something like that
    minOpacity?: number;

    /**
     * The minimum width of a rectangle in pixels. The property clamps rectangles'
     * widths when the viewport is zoomed out.
     *
     * This property also reduces flickering of very narrow rectangles when zooming.
     * The value should generally be at least one.
     *
     * **Default value:** `1`
     */
    minWidth?: number;

    /**
     * The minimum height of a rectangle in pixels. The property clamps rectangles' heights.
     *
     * **Default value:** `0`
     */
    minHeight?: number;

    /**
     * Radius of the rounded corners.
     *
     * **Default value:** `0`
     */
    cornerRadius?: number;

    /**
     * Radius of the top left rounded corner. Has higher precedence than `cornerRadius`.
     *
     * **Default value:** (None)
     */
    cornerRadiusTopLeft?: number;

    /**
     * Radius of the top right rounded corner. Has higher precedence than `cornerRadius`.
     *
     * **Default value:** (None)
     */
    cornerRadiusTopRight?: number;

    /**
     * Radius of the bottom left rounded corner. Has higher precedence than `cornerRadius`.
     *
     * **Default value:** (None)
     */
    cornerRadiusBottomLeft?: number;

    /**
     * Radius of the bottom right rounded corner. Has higher precedence than `cornerRadius`.
     *
     * **Default value:** (None)
     */
    cornerRadiusBottomRight?: number;
}

export interface RuleProps extends SecondaryPositionProps {
    /**
     * The minimum length of the rule in pixels. Use this property to ensure that
     * very short ranged rules remain visible even when the user zooms out.
     *
     * **Default value:** `0`
     */
    minLength?: number;

    /**
     * An array of of alternating stroke and gap lengths or `null` for solid strokes.
     *
     * **Default value:** `null`
     */
    strokeDash?: number[];

    /**
     * An offset for the stroke dash pattern.
     *
     * **Default value:** `0`
     */
    strokeDashOffset?: number;

    /**
     * The style of stroke ends. Available choices: `"butt"`, `"round`", and `"square"`.
     *
     * **Default value:** `"butt"`
     */
    strokeCap?: "butt" | "square" | "round";
}

export interface TextProps
    extends SecondaryPositionProps,
        AngleProps,
        ViewportEdgeFadeProps {
    /**
     * The text to display. The format of numeric data can be customized by
     * setting a [format specifier](https://github.com/d3/d3-format#locale_format)
     * to channel definition's `format` property.
     *
     * **Default value:** `""`
     */
    text?: Scalar;

    /**
     * The font size in pixels.
     *
     * **Default value:** `11`
     */
    size?: number;

    /**
     * The font typeface. GenomeSpy uses [SDF](https://github.com/Chlumsky/msdfgen)
     * versions of [Google Fonts](https://fonts.google.com/). Check their
     * availability at the [A-Frame
     * Fonts](https://github.com/etiennepinchon/aframe-fonts/tree/master/fonts)
     * repository. System fonts are **not** supported.
     *
     * **Default value:** `"Lato"`
     */
    font?: string;

    /**
     * The font style. Valid values: `"normal"` and `"italic"`.
     *
     * **Default value:** `"normal"`
     */
    fontStyle?: FontStyle;

    /**
     * The font weight. The following strings and numbers are valid values:
     * `"thin"` (`100`), `"light"` (`300`), `"regular"` (`400`),
     * `"normal"` (`400`), `"medium"` (`500`), `"bold"` (`700`),
     * `"black"` (`900`)
     *
     * **Default value:** `"regular"`
     */
    fontWeight?: FontWeight;

    /**
     * The horizontal alignment of the text. One of `"left"`, `"center"`, or `"right"`.
     *
     * **Default value:** `"left"`
     */
    align?: Align;

    /**
     * The vertical alignment of the text.  One of `"top"`, `"middle"`, `"bottom"`.
     *
     * **Default value:** `"bottom"`
     */
    baseline?: Baseline;

    /**
     * The horizontal offset between the text and its anchor point, in pixels.
     * Applied after the rotation by `angle`.
     */
    dx?: number;

    /**
     * The vertical offset between the text and its anchor point, in pixels.
     * Applied after the rotation by `angle`.
     */
    dy?: number;

    /**
     * If true, sets the secondary positional channel that allows the text to be squeezed
     * (see the `squeeze` property).
     * Can be used when:
     * 1) `"band"`, `"index"`, or `"locus"` scale is being used and
     * 2) only the primary positional channel is specified.
     *
     * **Default value:** `false`
     */
    fitToBand?: boolean;

    /**
     * The horizontal padding, in pixels, when the `x2` channel is used for ranged text.
     *
     * **Default value:** `0`
     */
    paddingX?: number;

    /**
     * The vertical padding, in pixels, when the `y2` channel is used for ranged text.
     *
     * **Default value:** `0`
     */
    paddingY?: number;

    /**
     * If true, the text is kept inside the viewport when the range of `x` and `x2`
     * intersect the viewport.
     */
    flushX?: boolean;

    /**
     * If true, the text is kept inside the viewport when the range of `y` and `y2`
     * intersect the viewport.
     */
    flushY?: boolean;

    /**
     * If the `squeeze` property is true and secondary positional channels (`x2` and/or `y2`)
     * are used, the text is scaled to fit mark's width and/or height.
     *
     * **Default value:** `true`
     */
    squeeze?: boolean;

    /**
     * Stretch letters so that they can be used with [sequence logos](https://en.wikipedia.org/wiki/Sequence_logo), etc...
     */
    logoLetters?: boolean;
}

export interface PointProps extends AngleProps {
    /**
     * One of `"circle"`, `"square"`, `"cross"`, `"diamond"`, `"triangle-up"`,
     * `"triangle-down"`, `"triangle-right"`, or `"triangle-left"`.
     *
     * **Default value:** `"circle"`
     */
    shape?: string;

    /**
     * Should the stroke only grow inwards, e.g, the diameter/outline is not affected by the stroke width.
     * Thus, a point that has a zero size has no visible stroke. This allows strokes to be used with
     * geometric zoom, etc.
     *
     * **Default value:** `false`
     */
    inwardStroke?: boolean;

    /**
     * Gradient strength controls the amount of the gradient eye-candy effect in the fill color.
     * Valid values are between 0 and 1.
     *
     * **Default value:** `0`
     */
    fillGradientStrength?: number;

    /**
     * Padding between sample facet's upper/lower edge and the maximum point size. This property
     * controls how tightly points are squeezed when facet's height is smaller than the maximum
     * point size. The unit is a proportion of facet's height. The value must be between `0`
     * and `0.5`. This property has no effect when sample faceting is not used.
     *
     * **Default value:** `0.1`
     */
    sampleFacetPadding?: number;

    /**
     * TODO
     *
     * **Default value:** `0.02`
     */
    semanticZoomFraction?: number;

    /**
     * Enables geometric zooming. The value is the base two logarithmic zoom level where the maximum
     * point size is reached.
     *
     * **Default value:** `0`
     */
    geometricZoomBound?: number;
}

export interface LinkProps extends SecondaryPositionProps {
    /**
     * The number of segments in the bézier curve. Affects the rendering quality and performance.
     * Use a higher value for a smoother curve.
     *
     * **Default value:* `101`
     */
    segments?: number;

    /**
     * Scaling factor of the arc's sagitta. The default value `1.0` produces roughly circular arcs.
     *
     * **Default value:** `1.0`
     */
    sagittaScaleFactor?: number;

    /**
     * Minimum length of the arc's sagitta. Makes very short links more clearly visible.
     *
     * **Default value:** `1.5`
     */
    minSagittaLength?: number;

    /**
     * TODO
     */
    color2?: string;

    /**
     * TODO
     */
    size2?: number;
}

// TODO: Mark-specific configs
export interface MarkConfig
    extends PointProps,
        RectProps,
        TextProps,
        RuleProps,
        LinkProps,
        FillAndStrokeProps {
    // Channels.
    x?: number;
    y?: number;
    color?: string;
    opacity?: number;
    size?: number;

    /**
     * Whether the `color` represents the `fill` color (`true`) or the `stroke` color (`false`).
     */
    filled?: boolean;

    /**
     * If true, the mark is clipped to the UnitView's rectangle. By default, clipping
     * is enabled for marks that have zoomable positional scales.
     */
    clip?: boolean | "never";

    /**
     * Offsets of the `x` and `x2` coordinates in pixels. The offset is applied
     * after the viewport scaling and translation.
     *
     * **Default value:** `0`
     */
    xOffset?: number;

    /**
     * Offsets of the `y` and `y2` coordinates in pixels. The offset is applied
     * after the viewport scaling and translation.
     *
     * **Default value:** `0`
     */
    yOffset?: number;

    /**
     * TODO
     */
    tooltip?: Tooltip;

    /**
     * The stroke width in pixels.
     */
    strokeWidth?: number;

    /**
     * Minimum size for WebGL buffers (number of data items).
     * Allows for using `bufferSubData()` to update graphics.
     *
     * This property is intended for internal use.
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
