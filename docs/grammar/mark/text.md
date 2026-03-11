# Text

Text mark displays each data item as text.

EXAMPLE examples/docs/grammar/mark/text/text-mark.json height=150

## Channels

In addition to primary and secondary [position](./index.md#channels) channels
and `color` and `opacity` channels, point mark has the following channels:
`text`, `size`, and `angle`.

## Properties

SCHEMA TextProps

## Examples

GenomeSpy's text mark provides several tricks useful with segmented data and
zoomable visualizations.

### Ranged text

The `x2` and `y2` channels allow for positioning the text inside a segment. The
text is either squeezed (default) or hidden when it does not fit in the segment.
The `squeeze` property controls the behavior.

The example below has two layers: gray rectangles at the bottom and ranged
text on the top. Try to zoom and pan to see how they behave!

EXAMPLE examples/docs/grammar/mark/text/ranged-text.json height=250

### Sequence logo

The example below demonstrates the use of the `logoLetters`, `squeeze`, and
`fitToBand` properties to ensure that the letters fully cover the rectangles
defined by the primary and secondary positional channels. Not all fonts look
good in sequence logos, but _Source Sans Pro_ seems decent.

EXAMPLE examples/docs/grammar/mark/text/sequence-logo.json height=150
