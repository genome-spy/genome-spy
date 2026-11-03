# Rule

Rule mark displays each row as a line segment. Rules can span the whole
width or height of the view. Alternatively, they may have specific endpoints.

EXAMPLE examples/docs/grammar/mark/rule/rule-mark.json height=150

## Channels

Rule mark supports the primary and secondary [position](./index.md#channels)
channels and the `color`, `fill`, `fillOpacity`, `stroke`, `strokeWidth`,
`strokeOpacity`, `opacity`, and `size` channels.

`fill` sets the body color and takes precedence over `color`. Both support
constant values, fields, expressions, and conditional encodings. `size` controls
the body thickness in logical pixels. `stroke` adds an outside border whose full
thickness is `strokeWidth` (default `1`). A four-pixel body with a one-pixel border
has a total thickness of six pixels. Borders are absent by default. `fillOpacity`
and `strokeOpacity` control the paints separately; `opacity` affects both.
Setting `filled: false` routes `color` to the border and leaves the body unfilled,
unless an explicit fill is provided.

Canvas rendering and Canvas-backed exports approximate borders by painting a
wider native stroke followed by the body. The border can show through a
translucent body, and per-rule opacity can produce a different combined color
and alpha. Native caps/dashes may leave butt endpoints and dash cuts without a
complete border. GPU rendering resolves the paints together. Vector SVG export
may show an antialiasing hairline at the internal paint boundary.

## Properties

SCHEMA RuleProps

`strokeCap` applies to each dash as well as the rule endpoints. Dash lengths and
gaps are measured along the centerline in logical pixels, before cap extension.
Round and square caps can close small gaps; a zero-length dash such as
`strokeDash: [0, 28]` produces dots with round caps, squares with square caps,
and no body with butt caps. Outside borders follow the combined dash silhouette.

## Examples

### Ranged rules

EXAMPLE examples/docs/grammar/mark/rule/ranged-rules.json height=150

### Human-mouse synteny

EXAMPLE examples/docs/grammar/mark/rule/synteny-hg38-mm10.json height=460
