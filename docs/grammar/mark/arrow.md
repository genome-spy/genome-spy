# Arrow

The `"arrow"` mark displays each data item as a directional interval. It is
useful for genomic and protein annotations where the span and direction both
carry meaning, such as genes, transcripts, alignments, and directional protein
domains.

EXAMPLE examples/docs/grammar/mark/arrow/arrow-mark.json height=240

## Channels

Arrow mark supports the primary and secondary [position](./index.md#channels)
channels, the `direction` channel, and the `color`, `stroke`, `fill`,
`opacity`, `strokeOpacity`, `fillOpacity`, and `strokeWidth` channels.

Use the position channels to encode the interval. Use mark properties to control
the arrow shape. Use the `direction` channel to map strand-like values such as
`+` and `-` to `"forward"` and `"reverse"`.

Built-in styles provide common arrow shapes:

- `"arrow-transcript"` draws a thin transcript-like line with repeated heads.
- `"arrow-block"` draws a thick filled interval with an arrowhead.
- `"arrow-block-notch"` draws a thick filled interval with an arrowhead and a
  start notch.

## Properties

SCHEMA ArrowProps
