# Rect

Rect mark displays each data object as a rectangle.

<div><genome-spy-doc-embed>

```json
{
  "data": {
    "sequence": { "start": 0, "stop": 20, "as": "z" }
  },
  "transform": [
    { "type": "formula", "as": "x", "expr": "random()" },
    { "type": "formula", "as": "x2", "expr": "datum.x + random() * 0.3" },
    { "type": "formula", "as": "y", "expr": "random()" },
    { "type": "formula", "as": "y2", "expr": "datum.y + random() * 0.4" }
  ],
  "mark": {
    "type": "rect",
    "strokeWidth": 2,
    "stroke": "#404040",
    "cornerRadius": 5
  },
  "encoding": {
    "x": { "field": "x", "type": "quantitative" },
    "x2": { "field": "x2" },
    "y": { "field": "y", "type": "quantitative" },
    "y2": { "field": "y2" },
    "color": { "field": "z", "type": "quantitative" }
  }
}
```

</genome-spy-doc-embed></div>

## Channels

Rect mark supports the primary and secondary [position](./index.md#channels)
channels and the `color`, `stroke`, `fill`, `opacity`, `strokeOpacity`,
`fillOpacity`, and `strokeWidth` channels.

## Properties

SCHEMA RectProps

## Examples

### Heatmap

When used with [`"band"`](../scale.md) or [`"index"`](../scale.md#index-scale)
scales, the rectangles fill the whole bands when only the primary positional
channel is defined.

<div><genome-spy-doc-embed>

```json
{
  "data": {
    "sequence": { "start": 0, "stop": 800, "as": "z" }
  },
  "transform": [
    { "type": "formula", "as": "y", "expr": "floor(datum.z / 40)" },
    { "type": "formula", "as": "x", "expr": "datum.z % 40" },
    {
      "type": "formula",
      "as": "z",
      "expr": "sin(datum.x / 8) + cos(datum.y / 10 - 0.5 + sin(datum.x / 20) * 2)"
    }
  ],
  "mark": "rect",
  "encoding": {
    "x": { "field": "x", "type": "index" },
    "y": { "field": "y", "type": "index" },
    "color": {
      "field": "z",
      "type": "quantitative",
      "scale": {
        "scheme": "magma"
      }
    }
  }
}
```

</genome-spy-doc-embed></div>

### Bars

<div><genome-spy-doc-embed>

```json
{
  "data": {
    "sequence": { "start": 0, "stop": 60, "as": "x" }
  },
  "transform": [
    {
      "type": "formula",
      "expr": "sin((datum.x - 30) / 4) + (datum.x - 30) / 30",
      "as": "y"
    }
  ],
  "mark": "rect",
  "encoding": {
    "x": { "field": "x", "type": "index", "scale": { "padding": 0.1 } },
    "y": { "field": "y", "type": "quantitative" },
    "y2": { "datum": 0 },
    "color": {
      "field": "y",
      "type": "quantitative",
      "scale": {
        "type": "threshold",
        "domain": [0],
        "range": ["#ed553b", "#20639b"]
      }
    }
  }
}
```

</genome-spy-doc-embed></div>

### Hatch Patterns

Rect marks can be filled with hatch patterns using the `hatch` property. The
hatch pattern is drawn inside the mark with the stroke color and stroke opacity,
aligned in screen space and scaled by the stroke width. The value can be a fixed
pattern string (such as `"diagonal"` or `"dots"`) or an expression that
evaluates to one of these patterns.

The hatch pattern is currently a mark property, i.e., the same for all instances
of the mark, but may be promoted to a visual channel in the future to allow
different hatch patterns for different data points.

<div><genome-spy-doc-embed height="200">

```json
{
  "params": [
    {
      "name": "hatch",
      "value": "diagonal",
      "bind": {
        "input": "select",
        "options": [
          "none",
          "diagonal",
          "antiDiagonal",
          "cross",
          "vertical",
          "horizontal",
          "grid",
          "dots",
          "rings",
          "ringsLarge"
        ]
      }
    },
    {
      "name": "strokeWidth",
      "value": 2,
      "bind": { "input": "range", "min": 0, "max": 50, "step": 0.25 }
    }
  ],
  "data": { "values": {} },
  "mark": {
    "type": "rect",
    "fill": "#caf0f8",
    "stroke": "black",
    "strokeWidth": { "expr": "strokeWidth" },
    "hatch": { "expr": "hatch" }
  }
}
```

</genome-spy-doc-embed></div>

### Drop Shadow

#### Shadowed marks

<div><genome-spy-doc-embed height="300">

```json
{
  "padding": 20,
  "data": { "values": [1, 2, 3, 4] },
  "mark": {
    "type": "rect",
    "shadowOpacity": 0.4,
    "shadowBlur": 20,
    "shadowOffsetX": 10,
    "shadowOffsetY": 10,
    "clip": true
  },
  "encoding": {
    "x": { "field": "data", "type": "ordinal", "scale": { "padding": 0.3 } },
    "y": {
      "field": "data",
      "type": "quantitative",
      "scale": { "padding": 0.1 }
    }
  }
}
```

</genome-spy-doc-embed></div>

#### Shadowed view

As the view background is a _rect_, it can also be decorated with a shadow.

<div><genome-spy-doc-embed height="300">

```json
{
  "padding": 20,
  "view": {
    "shadowOpacity": 0.2,
    "shadowBlur": 15,
    "shadowOffsetY": 3
  },
  "data": { "values": [1, 2, 3, 4] },
  "mark": "rect",
  "encoding": {
    "x": { "field": "data", "type": "ordinal", "scale": { "padding": 0.3 } },
    "y": {
      "field": "data",
      "type": "quantitative",
      "scale": { "padding": 0.1 }
    }
  }
}
```

</genome-spy-doc-embed></div>
