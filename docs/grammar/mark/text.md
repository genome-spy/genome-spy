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
