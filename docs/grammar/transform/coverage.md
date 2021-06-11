# Coverage

The `coverage` transform computes
[coverage](<https://en.wikipedia.org/wiki/Coverage_(genetics)>) for overlapping
segments. The result is a new list of non-overlapping segments with the coverage
values. The segments must be sorted by their start coordinates before passing
them to the coverage transform.

## Parameters

SCHEMA CoverageParams

## Example

Given the following data:

| start | end |
| ----- | --- |
| 0     | 4   |
| 1     | 3   |

... and configuration:

```json
{
  "type": "coverage",
  "start": "startpos",
  "end": "endpos"
}
```

A new list of segments is produced:

| start | end | coverage |
| ----- | --- | -------- |
| 0     | 1   | 1        |
| 1     | 3   | 2        |
| 3     | 4   | 1        |

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
  "resolve": { "scale": { "x": "shared" } },
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
        "x": { "field": "start", "type": "index" },
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
        "x": { "field": "start", "type": "index" },
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
