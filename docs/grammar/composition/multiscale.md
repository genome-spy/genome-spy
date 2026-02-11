# Multiscale Composition

The `multiscale` composition operator is designed for semantic zooming patterns
that are common in genomic tracks:

1. zoomed-out hint (`"Zoom in to see..."`)
2. intermediate aggregated view
3. zoomed-in detailed view

Instead of manually writing mirrored opacity ramps for each stage, `multiscale`
generates the required transitions automatically from `stops`.

## Example

This example is the same as
`packages/core/examples/techniques/multiscale.json`.

<div><genome-spy-doc-embed height="180">

```json
{
  "description": "A three-stage semantic zoom using the multiscale composition operator.",
  "view": { "stroke": "lightgray" },
  "height": 120,

  "resolve": { "scale": { "x": "shared" } },

  "encoding": {
    "x": {
      "field": "x",
      "type": "quantitative",
      "scale": { "zoom": true }
    },
    "y": {
      "field": "y",
      "type": "quantitative"
    }
  },

  "stops": [1, 0.1],

  "multiscale": [
    {
      "data": { "values": [{}] },
      "mark": {
        "type": "text",
        "text": "Zoom in to see details",
        "size": 16
      },
      "encoding": {
        "x": { "value": 0.5 },
        "y": { "value": 0.5 },
        "color": { "value": "#666666" }
      }
    },
    {
      "data": {
        "sequence": { "start": 0, "stop": 4000, "step": 16, "as": "x" }
      },
      "transform": [
        {
          "type": "formula",
          "expr": "sin(datum.x / 40)",
          "as": "y"
        },
        {
          "type": "formula",
          "expr": "datum.x + 16",
          "as": "x2"
        }
      ],
      "mark": "rect",
      "encoding": {
        "x2": { "field": "x2" }
      }
    },
    {
      "data": {
        "sequence": { "start": 0, "stop": 4000, "step": 1, "as": "x" }
      },
      "transform": [
        {
          "type": "formula",
          "expr": "sin(datum.x / 40) + (random() - 0.5) * 0.2",
          "as": "y"
        }
      ],
      "mark": "point",
      "encoding": {
        "opacity": { "value": 0.7 }
      }
    }
  ]
}
```

</genome-spy-doc-embed></div>

## Behavior

`multiscale` children are ordered from zoomed-out to zoomed-in. For `N` child
views, `stops` must contain `N - 1` values.

By default, channel selection is automatic:

1. If both `x` and `y` are available, the zoom metric is averaged.
2. If only one is available, that one is used.
3. Scales that are not visible at the `multiscale` scope (for example,
   independent descendant-local scales) are ignored.

## Properties

`multiscale` (array)
: Child views from zoomed-out to zoomed-in.

`stops` (array or object)
: Stop definition controlling transitions between adjacent levels.
  Array shorthand:
  `{"stops":[1,0.1]}`
  equals
  `{"stops":{"metric":"unitsPerPixel","values":[1,0.1]}}`.

`stops.metric` (string)
: Stop metric. Currently, `"unitsPerPixel"` is supported.

`stops.values` (number[])
: Stop values for the chosen metric. For `N` levels, provide `N - 1` values.

`stops.channel` (string, optional)
: `"auto"` (default), `"x"`, or `"y"`.

`stops.fade` (number, optional)
: Relative transition width around each stop. Default is `0.15`.
