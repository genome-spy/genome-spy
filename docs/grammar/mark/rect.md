# Rect

Rect mark displays each data item as a rectangle.

<div class="embed-example">
<div class="embed-container" style="height: 300px"></div>
<div class="embed-spec">

```json
{
    "tracks": [
        {
            "type": "SimpleTrack",
            "data": {
                "sequence": { "start": 0, "stop": 20, "as": "z" }
            },
            "transform": [
                { "type": "formula", "as": "x",  "expr": "random()" },
                { "type": "formula", "as": "x2", "expr": "datum.x + random() * 0.3" },
                { "type": "formula", "as": "y",  "expr": "random()" },
                { "type": "formula", "as": "y2", "expr": "datum.y + random() * 0.4" }
            ],
            "mark": "rect",
            "encoding": {
                "x":     { "field": "x", "type": "quantitative" },
                "x2":    { "field": "x2" },
                "y":     { "field": "y", "type": "quantitative" },
                "y2":    { "field": "y2" },
                "color": { "field": "z", "type": "quantitative" }
            }
        }
    ]
}
```

</div>
</div>

TODO:

* MinWidth
* MinHeight
* MinOpacity
* Offsets
