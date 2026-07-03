import { Scalar } from "./channel.js";
import { ExprRef } from "./parameter.js";
import { Align, Baseline, FontStyle, FontWeight } from "./font.js";
import { Tooltip } from "./tooltip.js";

export type MarkType =
    | "rect"
    | "point"
    | "rule"
    | "tick"
    | "text"
    | "link"
    | "arrow";

export interface MarkPropsBase {
    type: MarkType;

    /**
     * Named style reference(s) resolved from `config.style`.
     * If an array is provided, later styles override earlier ones.
     */
    style?: string | string[];

    /**
     * Mouse cursor shown while the pointer is over the mark.
     * Mark cursor takes precedence over enclosing view cursors.
     *
     * __Default value:__ browser default
     */
    cursor?: string | ExprRef;

    // Channels.

    /**
     * Position on the x axis.
     */
    x?: number | ExprRef;

    /**
     * Position on the y axis.
     */
    y?: number | ExprRef;

    /**
     * Color of the mark. Affects either `fill` or `stroke`, depending on the `filled` property.
     */
    color?: string | ExprRef;

    /**
     * Opacity of the mark. Affects `fillOpacity` or `strokeOpacity`, depending on the `filled` property.
     */
    opacity?: number | ExprRef;

    /**
     * Controls whether the mark is clipped to the UnitView's rectangle. The
     * values `"x"` and `"y"` clip only in the corresponding screen-space
     * direction. Inherited clipping from parent containers still applies unless
     * `"never"` is used.
     *
     * __Default value:__ the direction of zoomable positional scales
     */
    clip?: boolean | "x" | "y" | "never";

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
     * Minimum size for WebGL buffers (number of data items).
     * Allows for using `bufferSubData()` to update graphics.
     *
     * This property is intended for internal use.
     *
     * @internal
     */
    minBufferSize?: number;

    /**
     * Whether the x channel should build an index for efficient subset rendering.
     * If omitted, GenomeSpy enables indexing automatically for positional x encodings.
     *
     * @internal
     */
    buildIndex?: boolean;

    /**
     * Hide point-like mark instances whose anchor falls outside the inherited
     * visible range in the given screen-space direction.
     *
     * @internal
     */
    cullByVisibleRange?: boolean | "x" | "y";

    /**
     * Tooltip handler. If `null`, no tooltip is shown. If string, specifies
     * the [tooltip handler](https://genomespy.app/docs/api/embed-options/#custom-tooltip-handlers)
     * to use.
     */
    tooltip?: Tooltip;
}

export interface SizeProps {
    /**
     * Stroke width of `"link"` and `"rule"` marks in pixels, the area of the
     * bounding square of `"point"` mark, or the font size of `"text"` mark.
     */
    size?: number | ExprRef;
}

export interface FillAndStrokeProps {
    /**
     * The stroke width in pixels.
     */
    strokeWidth?: number | ExprRef;

    /**
     * Whether the `color` represents the `fill` color (`true`) or the `stroke` color (`false`).
     */
    filled?: boolean;

    /**
     * The fill color.
     */
    fill?: string | ExprRef;

    /**
     * The fill opacity. Value between `0` and `1`.
     */
    fillOpacity?: number | ExprRef;

    /**
     * The stroke color
     */
    stroke?: string | ExprRef;

    /**
     * The stroke opacity. Value between `0` and `1`.
     */
    strokeOpacity?: number | ExprRef;
}

export interface ShadowProps {
    /**
     * The color of the drop shadow. Any valid CSS color string is allowed.
     *
     * **Default value:** `"black"`
     */
    shadowColor?: string | ExprRef;

    /**
     * The opacity of the drop shadow. Value between `0` (fully transparent) and `1` (fully opaque).
     *
     * **Default value:** `0` (disabled)
     */
    shadowOpacity?: number | ExprRef;

    /**
     * The horizontal offset of the drop shadow in pixels. Positive values move the shadow to the right.
     *
     * **Default value:** `0`
     */
    shadowOffsetX?: number | ExprRef;

    /**
     * The vertical offset of the drop shadow in pixels. Positive values move the shadow downward.
     *
     * **Default value:** `0`
     */
    shadowOffsetY?: number | ExprRef;

    /**
     * The blur radius of the drop shadow in pixels. Higher values produce a more diffuse shadow.
     *
     * **Default value:** `0`
     */
    shadowBlur?: number | ExprRef;
}

export interface SecondaryPositionProps {
    /**
     * The secondary position on the x axis.
     */
    x2?: number | ExprRef;

    /**
     * The secondary position on the y axis.
     */
    y2?: number | ExprRef;
}

export interface AngleProps {
    /**
     * The rotation angle in degrees.
     *
     * **Default value:** `0`
     */
    angle?: number | ExprRef;
}

export interface MinPickingSizeProps {
    /**
     * The minimum picking size invisibly increases the stroke width or point diameter
     * of marks when pointing them with the mouse cursor, making it easier to select them.
     * The valus is the minimum size in pixels.
     *
     * **Default value:** `3.0` for `"link"` and `2.0` for `"point"`
     */
    minPickingSize?: number | ExprRef;
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

export interface RectProps
    extends
        MarkPropsBase,
        SecondaryPositionProps,
        FillAndStrokeProps,
        ShadowProps {
    type: "rect";

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
    minOpacity?: number | ExprRef;

    /**
     * The minimum width of a rectangle in pixels. The property clamps rectangles'
     * widths when the viewport is zoomed out.
     *
     * This property also reduces flickering of very narrow rectangles when zooming.
     * The value should generally be at least one.
     *
     * **Default value:** `1`
     */
    minWidth?: number | ExprRef;

    /**
     * The minimum height of a rectangle in pixels. The property clamps rectangles' heights.
     *
     * **Default value:** `0`
     */
    minHeight?: number | ExprRef;

    /**
     * Radius of the rounded corners.
     *
     * **Default value:** `0`
     */
    cornerRadius?: number | ExprRef;

    /**
     * Radius of the top left rounded corner. Has higher precedence than `cornerRadius`.
     *
     * **Default value:** (None)
     */
    cornerRadiusTopLeft?: number | ExprRef;

    /**
     * Radius of the top right rounded corner. Has higher precedence than `cornerRadius`.
     *
     * **Default value:** (None)
     */
    cornerRadiusTopRight?: number | ExprRef;

    /**
     * Radius of the bottom left rounded corner. Has higher precedence than `cornerRadius`.
     *
     * **Default value:** (None)
     */
    cornerRadiusBottomLeft?: number | ExprRef;

    /**
     * Radius of the bottom right rounded corner. Has higher precedence than `cornerRadius`.
     *
     * **Default value:** (None)
     */
    cornerRadiusBottomRight?: number | ExprRef;

    /**
     * A hatch pattern drawn inside the mark using the stroke width, color, and opacity.
     * The pattern is aligned in screen space and scaled by the stroke width.
     *
     * **Default value:** `"none"`
     */
    hatch?:
        | "none"
        | "diagonal"
        | "antiDiagonal"
        | "cross"
        | "vertical"
        | "horizontal"
        | "grid"
        | "dots"
        | "rings"
        | "ringsLarge"
        | ExprRef;
}

export interface ArrowProps
    extends MarkPropsBase, SecondaryPositionProps, FillAndStrokeProps {
    type: "arrow";

    /**
     * Orientation of the arrow body. If undefined, the orientation is inferred
     * from the encoded fields. Quantitative, index, and locus fields are
     * preferred as the arrow direction, so an arrow with quantitative `x` and
     * discrete `y` is horizontal.
     *
     * __Default value:__ inferred from the encoding
     */
    orient?: "horizontal" | "vertical" | ExprRef;

    /**
     * Direction of the arrow after sorting the interval endpoints. `"forward"`
     * points toward increasing values on the arrow axis. `"reverse"` points
     * toward decreasing values.
     *
     * __Default value:__ `"forward"`
     */
    direction?: "forward" | "reverse" | ExprRef;

    /**
     * Angle in degrees between the arrow axis and an outer edge of the
     * arrowhead. Smaller values produce longer, narrower heads. Larger values
     * produce shorter, blunter heads. Values are clamped to `[1, 90]`.
     *
     * __Default value:__ `45`
     */
    headAngle?: number | ExprRef;

    /**
     * Angle in degrees between the arrow axis and the arrowhead notch edge.
     * `90` places the notch point at the tip, producing a triangular head when
     * `headAngle` is less than `90`. Applies to `"triangle"` heads. `"open"`
     * heads use `headAngle` for the notch edge as well. Values are clamped to
     * `[1, 90]`.
     *
     * __Default value:__ `90`
     */
    headNotchAngle?: number | ExprRef;

    /**
     * Shape of the arrowhead. `"triangle"` draws a filled head. `"open"`
     * draws an open head whose thickness matches the magnitude of the stem
     * width.
     *
     * __Default value:__ `"triangle"`
     */
    headShape?: "triangle" | "open" | ExprRef;

    /**
     * Width of the arrowhead in pixels or as a proportion of the mark thickness.
     * The unit is controlled by `headWidthUnit`. The resolved width is clamped
     * to the mark thickness.
     *
     * __Default value:__ `1`
     */
    headWidth?: number | ExprRef;

    /**
     * Unit used for `headWidth`.
     *
     * __Default value:__ `"proportion"`
     */
    headWidthUnit?: "px" | "proportion" | ExprRef;

    /**
     * Whether to draw a notch at the start of the arrow. The start notch uses
     * the same slope as the arrowhead edge.
     *
     * __Default value:__ `false`
     */
    startNotch?: boolean | ExprRef;

    /**
     * Minimum visible length of the arrow stem in pixels. When a non-repeated
     * arrow is too short for the configured shape and minimum stem length, the
     * affected notch or head angle is made blunter toward 90 degrees. For
     * `"inside"` placement, this applies to `"triangle"` heads and is measured
     * from the start of the stem to where the stem meets the head notch edge.
     * For `"outside"` placement, this applies when `startNotch` is `true` and
     * is measured from the start notch to the head start. If `stemWidth` is
     * negative, there is no visible stem to preserve.
     *
     * __Default value:__ `0`
     */
    minStemLength?: number | ExprRef;

    /**
     * Whether arrowheads are repeated along the arrow. Repeated arrowheads do
     * not use `minStemLength`.
     *
     * __Default value:__ `false`
     */
    headRepeat?: boolean | ExprRef;

    /**
     * Spacing between repeated arrowheads in pixels. The effective spacing is
     * at least the rendered arrowhead footprint, including stroke.
     *
     * __Default value:__ `24`
     */
    headSpacing?: number | ExprRef;

    /**
     * Width of the arrow stem in pixels or as a proportion of the mark thickness.
     * The unit is controlled by `stemWidthUnit`. The resolved width is clamped
     * to the mark thickness. Negative values hide the stem, but their magnitude
     * still controls the thickness of `"open"` arrowheads.
     *
     * __Default value:__ `0.45`
     */
    stemWidth?: number | ExprRef;

    /**
     * Unit used for `stemWidth`.
     *
     * __Default value:__ `"proportion"`
     */
    stemWidthUnit?: "px" | "proportion" | ExprRef;

    /**
     * Placement of the arrowhead relative to the encoded interval.
     * `"inside"` keeps the whole arrowhead within the encoded interval.
     * `"outside"` places the arrowhead beyond the encoded interval so that the
     * head starts at the interval endpoint.
     *
     * __Default value:__ `"inside"`
     */
    headPlacement?: "inside" | "outside" | ExprRef;
}

export interface StrokeStyleProps {
    /**
     * The minimum stroke length in pixels. Use this property to ensure that
     * very short strokes remain visible even when the user zooms out.
     *
     * **Default value:** `0`
     */
    minLength?: number | ExprRef;

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
    strokeCap?: "butt" | "square" | "round" | ExprRef;
}

export interface RuleProps
    extends MarkPropsBase, SecondaryPositionProps, SizeProps, StrokeStyleProps {
    type: "rule";
}

export interface TickProps extends MarkPropsBase, StrokeStyleProps {
    type: "tick";

    /**
     * The orientation of the tick mark.
     *
     * If omitted, GenomeSpy infers the orientation when one positional channel
     * uses a band-like scale and the other does not, or when the orthogonal
     * channel is omitted. Specify `orient` explicitly when both `x` and `y`
     * use band-like scales.
     *
     * **Default value:** inferred
     */
    orient?: "vertical" | "horizontal";

    /**
     * The thickness of the tick mark in pixels.
     * Equivalent to the `size` of the underlying rule mark.
     *
     * **Default value:** `1`
     */
    thickness?: number;
}

export interface TextProps
    extends
        MarkPropsBase,
        SecondaryPositionProps,
        AngleProps,
        ViewportEdgeFadeProps,
        SizeProps {
    type: "text";

    /**
     * The text to display. The format of numeric data can be customized by
     * setting a [format specifier](https://github.com/d3/d3-format#locale_format)
     * to channel definition's `format` property.
     *
     * **Default value:** `""`
     */
    text?: Scalar | ExprRef;

    /**
     * The font size in pixels.
     *
     * **Default value:** `11`
     */
    size?: number | ExprRef;

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
    fitToBand?: boolean | ExprRef;

    /**
     * The horizontal padding, in pixels, when the `x2` channel is used for ranged text.
     *
     * **Default value:** `0`
     */
    paddingX?: number | ExprRef;

    /**
     * The vertical padding, in pixels, when the `y2` channel is used for ranged text.
     *
     * **Default value:** `0`
     */
    paddingY?: number | ExprRef;

    /**
     * If true, the text is kept inside the viewport when the range of `x` and `x2`
     * intersect the viewport.
     */
    flushX?: boolean | ExprRef;

    /**
     * If true, the text is kept inside the viewport when the range of `y` and `y2`
     * intersect the viewport.
     */
    flushY?: boolean | ExprRef;

    /**
     * If the `squeeze` property is true and secondary positional channels (`x2` and/or `y2`)
     * are used, the text is scaled to fit mark's width and/or height.
     *
     * **Default value:** `true`
     */
    squeeze?: boolean | ExprRef;

    /**
     * Stretch letters so that they can be used with [sequence logos](https://en.wikipedia.org/wiki/Sequence_logo), etc...
     */
    logoLetters?: boolean | ExprRef;
}

export interface PointProps
    extends
        MarkPropsBase,
        FillAndStrokeProps,
        AngleProps,
        SizeProps,
        MinPickingSizeProps {
    type: "point";

    /**
     * One of `"circle"`, `"square"`, `"cross"`, `"diamond"`, `"triangle-up"`,
     * `"triangle-down"`, `"triangle-right"`, `"triangle-left"`, `"tick-up"`,
     * `"tick-down"`, `"tick-right"`, or `"tick-left"`
     *
     * **Default value:** `"circle"`
     */
    shape?: string | ExprRef;

    /**
     * Should the stroke only grow inwards, e.g, the diameter/outline is not affected by the stroke width.
     * Thus, a point that has a zero size has no visible stroke. This allows strokes to be used with
     * geometric zoom, etc.
     *
     * **Default value:** `false`
     */
    inwardStroke?: boolean | ExprRef;

    /**
     * Horizontal offset in pixels.
     *
     * **Default value:** `0`
     */
    dx?: number | ExprRef;

    /**
     * Vertical offset in pixels.
     *
     * **Default value:** `0`
     */
    dy?: number | ExprRef;

    /**
     * Additional padding used by sample facets.
     *
     * **Default value:** `0.1`
     *
     * @internal
     */
    sampleFacetPadding?: number;

    /**
     * Gradient strength controls the amount of the gradient eye-candy effect in the fill color.
     * Valid values are between `0` and `1`.
     *
     * **Default value:** `0`
     */
    fillGradientStrength?: number | ExprRef;

    /**
     * The semantic score used by semantic zooming in the point mark.
     * This is primarily intended for internal use.
     *
     * **Default value:** `0`
     *
     * @internal
     */
    semanticScore?: number | ExprRef;

    /**
     * TODO
     *
     * **Default value:** `0.02`
     */
    semanticZoomFraction?: number | ExprRef;

    /**
     * Enables geometric zooming. The value is the base two logarithmic zoom level where the maximum
     * point size is reached.
     *
     * **Default value:** `0`
     */
    geometricZoomBound?: number;
}

export interface LinkProps
    extends
        MarkPropsBase,
        SecondaryPositionProps,
        SizeProps,
        MinPickingSizeProps {
    type: "link";

    /**
     * The shape of the link path.
     *
     * The `"arc"` shape draws a circular arc between the two points. The apex of the
     * arc resides on the left side of the line that connects the two points.
     * The `"dome"` shape draws a vertical or horizontal arc with a specific height.
     * The primary positional channel determines the apex of the arc and the secondary
     * determines the endpoint placement.
     * The `"diagonal"` shape draws an "S"-shaped curve between the two points.
     * The `"line"` shape draws a straight line between the two points. See an
     * [example](#different-link-shapes-and-orientations) of the different shapes below.
     *
     * **Default value:** `"arc"`
     */
    linkShape?: "arc" | "diagonal" | "line" | "dome" | ExprRef;

    /**
     * The orientation of the link path. Either `"vertical"` or `"horizontal"`.
     * Only applies to diagonal links.
     *
     * **Default value:** `"vertical"`
     */
    orient?: "vertical" | "horizontal" | ExprRef;

    /**
     * Whether the apex of the `"dome"` shape is clamped to the viewport edge. When over a
     * half of the dome is located outside the viewport, clamping allows for more accurate
     * reading of the value encoded by the apex' position.
     *
     * **Default value:** `false`
     */
    clampApex?: boolean | ExprRef;

    /**
     * The number of segments in the bézier curve. Affects the rendering quality and performance.
     * Use a higher value for a smoother curve.
     *
     * **Default value:** `101`
     */
    segments?: number | ExprRef;

    /**
     * Scaling factor for the `"arc`" shape's height. The default value `1.0` produces roughly circular arcs.
     *
     * **Default value:** `1.0`
     */
    arcHeightFactor?: number | ExprRef;

    /**
     * The minimum height of an `"arc"` shape. Makes very short links more clearly visible.
     *
     * **Default value:** `1.5`
     */
    minArcHeight?: number | ExprRef;

    /**
     * The maximum length of `"arc"` shape's chord in pixels. The chord is the line segment
     * between the two points that define the arc. Limiting the chord length serves two purposes
     * when zooming in close enough:
     * 1) it prevents the arc from becoming a straight line and
     * 2) it mitigates the limited precision of floating point numbers in arc rendering.
     *
     * **Default value:** `50000`
     */
    maxChordLength?: number | ExprRef;

    /**
     * The range of the `"arc"` shape's fading distance in pixels. This property allows for
     * making the arc's opacity fade out as it extends away from the chord. The fading distance
     * is interpolated from one to zero between the interval defined by this property.
     * Both `false` and `[0, 0]` disable fading.
     *
     * **Default value:** `false`
     */
    arcFadingDistance?: [number, number] | false | ExprRef;

    /**
     * Disables fading of the link when an mark instance is subject to any point selection.
     * As the fading distance is unavailable as a visual channel, this property allows for
     * enhancing the visibility of the selected links.
     *
     * **Default value:** `true`
     */
    noFadingOnPointSelection?: boolean | ExprRef;
}

export type MarkProps =
    | RectProps
    | ArrowProps
    | TextProps
    | RuleProps
    | TickProps
    | LinkProps
    | PointProps;
