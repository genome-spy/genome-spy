# Rect

Rect mark displays each data object as a rectangle.

EXAMPLE examples/docs/grammar/mark/rect/rect-mark.json

## Channels

Rect mark supports the primary and secondary [position](./index.md#channels)
channels and the `color`, `stroke`, `fill`, `opacity`, `strokeOpacity`,
`fillOpacity`, and `strokeWidth` channels.

## Properties

SCHEMA RectProps

## Examples

### Heatmap

When used with [`"band"`](../scale.md) or [`"index"`](../scale.md#index-scale)
scales, the rectangles fill the whole bands when only the primary positional
channel is defined.

EXAMPLE examples/docs/grammar/mark/rect/heatmap.json

### Bars

EXAMPLE examples/docs/grammar/mark/rect/bars.json

### Hatch Patterns

Rect marks can be filled with hatch patterns using the `hatch` property. The
hatch pattern is drawn inside the mark with the stroke color and stroke opacity,
aligned in screen space and scaled by the stroke width. The value can be a fixed
pattern string (such as `"diagonal"` or `"dots"`) or an expression that
evaluates to one of these patterns.

The hatch pattern is currently a mark property, i.e., the same for all instances
of the mark, but may be promoted to a visual channel in the future to allow
different hatch patterns for different data points.

EXAMPLE examples/docs/grammar/mark/rect/hatch-patterns.json height=200

### Drop Shadow

#### Shadowed marks

EXAMPLE examples/docs/grammar/mark/rect/shadowed-marks.json height=300

#### Shadowed view

As the view background is a _rect_, it can also be decorated with a shadow.

EXAMPLE examples/docs/grammar/mark/rect/shadowed-view.json height=300
