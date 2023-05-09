# Layering Views

The `layer` operator superimposes multiple views over each other.

## Example

<div><genome-spy-doc-embed height="250">

```json
{
  "data": {
    "values": [
      { "a": "A", "b": 28 },
      { "a": "B", "b": 55 },
      { "a": "C", "b": 43 },
      { "a": "D", "b": 91 },
      { "a": "E", "b": 81 },
      { "a": "F", "b": 53 },
      { "a": "G", "b": 19 },
      { "a": "H", "b": 87 },
      { "a": "I", "b": 52 }
    ]
  },
  "encoding": {
    "x": {
      "field": "a",
      "type": "nominal",
      "scale": { "padding": 0.1 },
      "axis": { "labelAngle": 0 }
    },
    "y": { "field": "b", "type": "quantitative" }
  },
  "layer": [
    {
      "name": "Bar",
      "mark": "rect"
    },
    {
      "name": "Label",
      "mark": { "type": "text", "dy": -9 },
      "encoding": {
        "text": { "field": "b" }
      }
    }
  ]
}
```

</genome-spy-doc-embed></div>

To specify multiple layers, use the `layer` property:

```json
{
  "layer": [
    ...  // Single or layered view specifications
  ]
}
```

The provided array may contain both single view specifications and layered
specifications. The encodings and data that are specified in a layer view
propagate to its descendants. For example, in the above example, the "Bar" and
"Label" views inherit the data and the encodings for the `x` and `y` channels
from their parent, the layer view.

## Resolve

By default, layers share their scales and axes, unioning the data domains.

## More examples

### Lollipop plot

This example layers two marks to create a composite mark, a lollipop. Yet
another layer is used for the baseline.

<div><genome-spy-doc-embed>

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

</genome-spy-doc-embed></div>
