# Layering Views

The `layer` operator overlays multiple views in the same space. By default,
layers share coordinate space and scales, which makes it straightforward to
combine complementary marks (for example, bars and labels) into one composite
view.

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

The provided array may contain both [single
view](../index.md#a-single-view-specification) specifications and layer
specifications. The encodings and data that are specified in a layer view
propagate to its descendants. For example, in the above example, the `"Bar"` and
`"Label"` views inherit the data and encodings for the `x` and `y` channels from
their parent, the layer view.

## Zoom-driven layer opacity

Layer (and unit) views support zoom-dependent opacity using `opacity` with
`unitsPerPixel` and `values`. This is useful for semantic zooming where one
layer is visible when zoomed out and another appears when zoomed in.
`unitsPerPixel` means data-units per screen pixel. With genomic locus scales,
you can read it as base pairs per pixel.

If layers are alternative zoom states (even just overview + detail), prefer
[`multiscale`](./multiscale.md). Use direct `opacity` when layers are additive
and meant to be visible together.

```json
{
  "opacity": {
    "unitsPerPixel": [100000, 40000],
    "values": [0, 1]
  }
}
```

The opacity is interpolated between the stops. In the example above, the layer
is invisible at `100000` units/pixel and fully visible at `40000` units/pixel.
Outside the range, the nearest stop value is used.

`unitsPerPixel` can also be expression-driven:

```json
{
  "opacity": {
    "unitsPerPixel": [
      { "expr": "windowSize / max(width, 1)" },
      { "expr": "0.5 * windowSize / max(width, 1)" }
    ],
    "values": [0, 1]
  }
}
```

### Cross-fading overview and detail layers

Use opposite stop orders in two layers to cross-fade between them while
zooming:

```json
{
  "layer": [
    {
      "name": "Overview",
      "opacity": {
        "unitsPerPixel": [100000, 40000],
        "values": [1, 0]
      },
      "mark": "rect"
    },
    {
      "name": "Detail",
      "opacity": {
        "unitsPerPixel": [100000, 40000],
        "values": [0, 1]
      },
      "mark": "point"
    }
  ]
}
```

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

  "layer": [
    {
      "name": "Baseline",
      "data": { "values": [0] },
      "mark": "rule",
      "encoding": {
        "y": { "field": "data", "type": "quantitative", "title": null },
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
            "filled": true
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
