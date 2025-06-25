# Measure Text

The `"measureText"` transforms measures the length of a string in pixels. The
measurement can be used in downstream layout computations with the
[filterScoredLabels](./filter-scored-labels.md) transform.

For an usage example, check the [Annotation
Tracks](https://observablehq.com/@tuner/annotation-tracks?collection=@tuner/genomespy)
notebook.

## Parameters

SCHEMA MeasureTextParams

## Example

```json
{
  "type": "measureText",
  "fontSize": 11,
  "field": "symbol",
  "as": "_textWidth"
}
```
