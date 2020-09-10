# Text

Text mark displays each data item as text.

<div class="embed-example">
<div class="embed-container" style="height: 200px"></div>
<div class="embed-spec">
```json
{
  "data": { "url": "sincos.csv" },
  "mark": "text",
  "encoding": {
    "x": { "field": "x", "type": "quantitative" },
    "y": { "field": "sin", "type": "quantitative" },
    "text": { "field": "sin", "type": "quantitative", "format": ".2f" },
    "size": {
      "field": "x",
      "type": "quantitative",
      "scale": {
        "range": [6, 28]
      }
    }
  }
}
```
</div>
</div>

## Examples

### Ranged text

<div class="embed-example">
<div class="embed-container" style="height: 250px"></div>
<div class="embed-spec">
```json
{
  "data": {
    "values": ["A", "B", "C", "D", "E", "F", "G"]
  },
  "transform": [
    { "type": "formula", "expr": "random() * 100", "as": "a" },
    { "type": "formula", "expr": "datum.a + random() * 60", "as": "b" }
  ],
  "encoding": {
    "x": { "field": "a", "type": "quantitative" },
    "x2": { "field": "b" },
    "y": {
      "field": "data",
      "type": "nominal",
      "scale": {
        "padding": 0.3
      }
    }
  },
  "layer": [
    {
      "mark": "rect",
      "encoding": { "color": { "value": "#eaeaea" } }
    },
    {
      "mark": {
        "type": "text",
        "align": "center",
        "baseline": "middle"
      },
      "encoding": {
        "text": {
          "expr": "'Hello ' + floor(datum.a)",
          "type": "ordinal"
        },
        "size": { "value": 12 }
      }
    }
  ]
}
```
</div>
</div>
