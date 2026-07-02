# Arrow

The `"arrow"` mark displays each data item as a directional interval. It is
useful for genomic and protein annotations where the span and direction both
carry meaning, such as genes, transcripts, alignments, and directional protein
domains.

EXAMPLE examples/docs/grammar/mark/arrow/arrow-mark.json height=240

## Channels

Arrow mark supports the primary and secondary [position](./index.md#channels)
channels and the `color`, `stroke`, `fill`, `opacity`, `strokeOpacity`,
`fillOpacity`, and `strokeWidth` channels.

Use the position channels to encode the interval. Use mark properties to control
the arrow shape. For data-driven differences in arrow style, create separate
layers for each style or direction.

## Properties

SCHEMA ArrowProps

