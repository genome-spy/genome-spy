# Arrow

The `"arrow"` mark displays each data item as a directed line or ranged
segment. It supports horizontal, vertical, and diagonal arrows, making it useful
for genomic and protein annotations where span and direction both carry meaning,
such as genes, transcripts, alignments, and directional protein domains, and for
general directed relationships.

EXAMPLE examples/docs/grammar/mark/arrow/arrow-mark.json height=200

## Channels

The arrow mark supports the primary and secondary [position](./index.md#channels)
channels, the `direction` channel, and the `color`, `stroke`, `fill`,
`opacity`, `strokeOpacity`, `fillOpacity`, and `strokeWidth` channels.

The position channels define the arrow endpoints. Axis-aligned arrows can use
only `x` and `x2`, or only `y` and `y2`; diagonal arrows use both `x`/`x2` and
`y`/`y2`. By default, the arrowhead points from the primary endpoint (`x`, `y`)
toward the secondary endpoint (`x2`, `y2`). The `direction` channel can
override this and is often the most convenient way to map strand-like values
such as `+` and `-` to `"forward"` and `"reverse"`.

Shape is controlled with mark properties. The `size` mark property controls the
stem thickness. Numeric `size` values are pixels. For axis-aligned arrows,
`size: { "band": 0.8 }` uses a fraction of the perpendicular band width. If the
perpendicular channel has no band-like scale, the fraction is resolved against
the perpendicular view span. Band-relative size is not supported for diagonal
arrows.

`headWidth` is a multiplier of the resolved `size` and is clamped to the
available perpendicular lane.

## Properties

SCHEMA ArrowProps

## Examples

### Built-in Styles

Built-in styles provide common arrow shapes:

- `"arrow-transcript"` draws a thin transcript-like line with repeated heads.
- `"arrow-block"` draws a thick filled segment with an arrowhead.
- `"arrow-block-notch"` draws a thick filled segment with an arrowhead and a
  start notch.

EXAMPLE examples/docs/grammar/mark/arrow/arrow-styles.json height=240 spechidden

### Arrow Playground

The arrow shape parameters can be adjusted interactively:

EXAMPLE examples/docs/grammar/mark/arrow/arrow-playground.json height=600 spechidden
