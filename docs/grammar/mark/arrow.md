# Arrow

The `"arrow"` mark displays each data item as a directional segment. It is
useful for genomic and protein annotations where the span and direction both
carry meaning, such as genes, transcripts, alignments, and directional protein
domains, and for general directed relationships.

EXAMPLE examples/docs/grammar/mark/arrow/arrow-mark.json height=240

## Channels

Arrow mark supports the primary and secondary [position](./index.md#channels)
channels, the `direction` channel, and the `color`, `stroke`, `fill`,
`opacity`, `strokeOpacity`, `fillOpacity`, and `strokeWidth` channels.

Use the position channels to encode the segment endpoints. Use mark properties
to control the arrow shape. Use the `direction` channel to map strand-like
values such as `+` and `-` to `"forward"` and `"reverse"`.

Use the `size` mark property to control the stem thickness. Numeric `size`
values are pixels. The default is `12`. The arrow mark also accepts
`size: { "band": 0.8 }`, which uses a fraction of the perpendicular band width
for axis-aligned arrows. If the perpendicular channel has no band-like scale,
the fraction is resolved against the perpendicular view span. The
`size.channel` property can explicitly select `"x"` or `"y"` as the reference
channel. Band-relative size is not supported for diagonal arrows.

The `size` encoding channel is also supported for data-driven thickness. Encoded
sizes are pixel values and override mark-level `size`; the `{ "band": ... }`
form is only available as an arrow mark property.

`headWidth` is a multiplier of the resolved `size` and is clamped to the
available perpendicular lane. Set `stem` to `false` to hide the stem while still
using the resolved `size` for open-head thickness. Set `headSpacing` to `null`
to draw only the primary arrowhead, or to a number to repeat arrowheads using
spacing relative to the resolved `size`.

Built-in styles provide common arrow shapes:

- `"arrow-transcript"` draws a thin transcript-like line with repeated heads.
- `"arrow-block"` draws a thick filled segment with an arrowhead.
- `"arrow-block-notch"` draws a thick filled segment with an arrowhead and a
  start notch.

## Properties

SCHEMA ArrowProps
