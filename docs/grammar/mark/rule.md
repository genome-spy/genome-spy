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
the body thickness in logical pixels. `stroke` adds a border whose full thickness is `strokeWidth` (default `1`).
`strokeAlign` places that band inside, centered on, or outside the nominal body
boundary; the default is `"outside"`. Alignment also applies at caps and dash
boundaries and supports parameter expressions. With the default outside alignment,
a four-pixel body with a one-pixel border has a total thickness of six pixels. Borders are absent by default. `fillOpacity`
and `strokeOpacity` control the paints separately; `opacity` affects both.
Setting `filled: false` routes `color` to the border and leaves the body unfilled,
unless an explicit fill is provided.

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

### Outlined rules

Solid, dashed, and dotted rules can share the same fill and outside border:

EXAMPLE examples/docs/grammar/mark/rule/outlined-rules.json height=220

!!! note "Rendering caveats"

    The Canvas renderer and Canvas-backed exports approximate outlines with native
    strokes to maintain interactive performance. They use an outside-style border
    for every `strokeAlign` value. Borders can show through translucent fills,
    opacity can blend differently, and butt endpoints or dash cuts may lack a
    complete border.

    SVG export expands each dash into path geometry and uses a mask for each
    outlined rule. Large numbers of outlined dashes can produce large SVG files
    that are slow to render. SVG viewers may also show a thin antialiasing seam
    between the fill and border.

### Weighted network

White outside borders separate crossing links while preserving the colored body
thickness set by `size`, so link weights remain readable. Centered and inside
borders cover part of the body and can obscure thin links. The node positions
are precomputed with a force-directed layout, and points draw the nodes above
the links.

EXAMPLE examples/docs/grammar/mark/rule/weighted-network.json height=380 spechidden

### Human-mouse synteny

EXAMPLE examples/docs/grammar/mark/rule/synteny-hg38-mm10.json height=460
