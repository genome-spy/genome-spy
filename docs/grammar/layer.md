# Layering Views

Layer operator superimposes multiple views over each other.

## Example

<div class="embed-example">
<div class="embed-container" style="height: 300px"></div>
<div class="embed-spec">

```json
{
  "name": "The Root",
  "description": "Lollipop plot example",

  "resolve": { "axis": { "y": "independent" } },

  "layer": [
    {
      "name": "Baseline",
      "data": { "values": [0] },
      "mark": "rule",
      "encoding": {
        "y": { "field": "data", "type": "quantitative", "axis": null },
        "color": { "value": "lightgray" }
      }
    },
    {
      "name": "Arrows",

      "data": {
        "sequence": {
          "start": 0,
          "stop": 6.284,
          "step": 0.39269908169,
          "as": "x"
        }
      },

      "transform": [
        { "type": "formula", "expr": "sin(datum.x)", "as": "sin(x)" }
      ],

      "encoding": {
        "x": { "field": "x", "type": "quantitative" },
        "y": {
          "field": "sin(x)",
          "type": "quantitative",
          "scale": { "padding": 0.1 }
        },
        "color": { "field": "sin(x)", "type": "quantitative" }
      },

      "layer": [
        {
          "name": "Arrow shafts",

          "mark": {
            "type": "rule",
            "size": 3
          }
        },
        {
          "name": "Arrowheads",

          "mark": {
            "type": "point",
            "size": 500,
            "strokeWidth": 0
          },

          "encoding": {
            "shape": {
              "field": "sin(x)",
              "type": "nominal",
              "scale": {
                "type": "threshold",
                "domain": [-0.01, 0.01],
                "range": ["triangle-down", "diamond", "triangle-up"]
              }
            }
          }
        }
      ]
    }
  ]
}
```

</div>
</div>

To specify multiple layers, use the `layer` property:

```json
{
  "layer": [
    ...  // Single or layered view specifications
  ]
}
```

The provided array may contain both single view specifications or layered
specifications. In the lollipop plot **example** above, the layered root view
contains the "Baseline" view and the layered "Arrows" view.

The encodings and data that are specified in a layer view propagate to its
descendants. For example, the "Arrow shafts" and "Arrowheads" views inherit
the _sin function_ dataset and the encodings for channels `x`, `y`, and
`color` from their parent, the "Arrows" view.

## Resolve

By default, layers share their scales and axes, unioning the data domains.
