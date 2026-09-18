# Measure Text

The `"measureText"` transform measures the length of a string in pixels. The
measurement can be used in downstream layout computations with the
[filterScoredLabels](./filter-scored-labels.md) transform or as a variable
collision length for the [displace1d](./displace1d.md) transform.

Custom fonts can be configured with the same `font`, `fontStyle`, and
`fontWeight` properties as the [`text`](../mark/text.md) mark.

Measurements use the active renderer's text geometry, keeping downstream
filtering and collision layout consistent with live text.

For an usage example, check the [Annotation
Tracks](https://observablehq.com/@tuner/annotation-tracks?collection=@tuner/genomespy)
notebook.

## Parameters

SCHEMA MeasureTextParams

## Example

The example below shows the source text in the left panel and the measured
width in pixels in the right panel.

EXAMPLE examples/docs/grammar/transform/measure-text/measure-text-table.json height=220
