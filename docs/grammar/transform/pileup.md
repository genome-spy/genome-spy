# Pileup

The pileup transform computes a piled up layout for overlapping segments. The
computed lane can be used to position the segments in a visualization.
The segments must be sorted by their start coordinates.

## Parameters

SCHEMA PileupConfig

## Example

Given the following data:

| start | end |
| ----- | --- |
| 0     | 4   |
| 1     | 3   |
| 2     | 6   |
| 4     | 8   |

... and configuration:

```json
{
  "type": "pileup",
  "start": "start",
  "end": "end",
  "as": "lane"
}
```

A new field is added:

| start | end | lane |
| ----- | --- | ---- |
| 0     | 4   | 0    |
| 1     | 3   | 1    |
| 2     | 6   | 2    |
| 4     | 8   | 1    |

## Interactive example

The following example demonstrates both `coverage` and `pileup` transforms.

<div class="embed-example">
<div class="embed-container" style="height: 300px"></div>
<div class="embed-spec">

```json
{
  "data": {
    "sequence": {
      "start": 1,
      "stop": 100,
      "as": "start"
    }
  },
  "transform": [
    {
      "type": "formula",
      "expr": "datum.start + ceil(random() * 20)",
      "as": "end"
    }
  ],
  "concat": [
    {
      "styles": { "height": 100 },
      "transform": [
        {
          "type": "coverage",
          "start": "start",
          "end": "end",
          "as": "coverage"
        }
      ],
      "mark": "rect",
      "encoding": {
        "x": { "field": "start", "type": "quantitative" },
        "x2": { "field": "end" },
        "y": { "field": "coverage", "type": "quantitative" }
      }
    },
    {
      "transform": [
        {
          "type": "pileup",
          "start": "start",
          "end": "end",
          "as": "lane"
        }
      ],
      "mark": "rect",
      "encoding": {
        "x": { "field": "start", "type": "quantitative" },
        "x2": { "field": "end" },
        "y": {
          "field": "lane",
          "type": "ordinal",
          "scale": {
            "type": "band",
            "padding": 0.2,
            "reverse": true
          },
          "axis": null
        }
      }
    }
  ]
}
```
