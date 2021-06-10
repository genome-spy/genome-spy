# Stack

The `stack` transform computes a stacked layout. Stacked bar plots and [sequence
logos](https://www.wikiwand.com/en/Sequence_logo) are some of its applications.

## Parameters

SCHEMA StackParams

## Examples

### Stacked bar plot

<div class="embed-example">
<div class="embed-container" style="height: 250px"></div>
<div class="embed-spec">

```json
{
  "data": {
    "values": [
      { "x": 1, "q": "A", "z": 7 },
      { "x": 1, "q": "B", "z": 3 },
      { "x": 1, "q": "C", "z": 10 },
      { "x": 2, "q": "A", "z": 8 },
      { "x": 2, "q": "B", "z": 5 },
      { "x": 3, "q": "B", "z": 10 }
    ]
  },
  "transform": [
    {
      "type": "stack",
      "field": "z",
      "groupby": ["x"]
    }
  ],
  "mark": "rect",
  "encoding": {
    "x": { "field": "x", "type": "nominal", "band": 0.8 },
    "y": { "field": "y0", "type": "quantitative" },
    "y2": { "field": "y1" },
    "color": { "field": "q", "type": "nominal" }
  }
}
```

</div>
</div>

### Sequence logo

<div class="embed-example">
<div class="embed-container" style="height: 150px"></div>
<div class="embed-spec">

```json
{
  "data": {
    "values": [
      { "pos": 1, "base": "A", "count": 2 },
      { "pos": 1, "base": "C", "count": 3 },
      { "pos": 1, "base": "T", "count": 5 },
      { "pos": 2, "base": "A", "count": 7 },
      { "pos": 2, "base": "C", "count": 3 },
      { "pos": 3, "base": "A", "count": 10 },
      { "pos": 4, "base": "T", "count": 9 },
      { "pos": 4, "base": "G", "count": 1 },
      { "pos": 5, "base": "G", "count": 8 },
      { "pos": 6, "base": "G", "count": 7 }
    ]
  },
  "transform": [
    {
      "type": "stack",
      "field": "count",
      "groupby": ["pos"],
      "offset": "information",
      "as": ["_y0", "_y1"],
      "baseField": "base",
      "sort": { "field": "count", "order": "ascending" }
    }
  ],
  "encoding": {
    "x": { "field": "pos", "type": "index" },
    "y": {
      "field": "_y0",
      "type": "quantitative",
      "scale": { "domain": [0, 2] },
      "title": "Information"
    },
    "y2": { "field": "_y1" },
    "text": { "field": "base", "type": "nominal" },
    "color": {
      "field": "base",
      "type": "nominal",
      "scale": {
        "type": "ordinal",
        "domain": ["A", "C", "T", "G"],
        "range": ["#7BD56C", "#FF9B9B", "#86BBF1", "#FFC56C"]
      }
    }
  },
  "mark": {
    "type": "text",
    "font": "Source Sans Pro",
    "fontWeight": 700,
    "size": 100,
    "squeeze": true,
    "fitToBand": true,

    "paddingX": 0,
    "paddingY": 0,

    "logoLetters": true
  }
}
```

</div>
</div>
