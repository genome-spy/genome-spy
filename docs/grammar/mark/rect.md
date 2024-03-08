# Rect

Rect mark displays each data item as a rectangle.

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
