# Layer

<div class="embed-example">
<div class="embed-container" style="height: 300px"></div>
<div class="embed-spec">

```json
{
    "tracks": [{
        "type": "SimpleTrack",

        "layer": [
            {
                "name": "Horizontal line",
                "data": { "values": [ 0 ]},
                "mark": "rule",
                "encoding": {
                    "y": { "field": "data", "type": "quantitative", "axis": null },
                    "color": { "value": "lightgray" }
                }
            },
            {
                "name": "Arrows",
                "data": {
                    "sequence": { "start": 0, "stop": 6.284, "step": 0.39269908169, "as": "x" }
                },
                "transform": [
                    { "type": "formula", "expr": "sin(datum.x)", "as": "sin(x)" }
                ],
                "encoding": {
                    "x": { "field": "x", "type": "quantitative" },
                    "y": { "field": "sin(x)", "type": "quantitative", "scale": { "padding": 0.1 } },
                    "color": { "field": "sin(x)", "type": "quantitative" }
                },
                "layer": [
                    {
                        "name": "Arrow shafts",
                        "mark": "rule",
                        "encoding": {
                            "y2": { "constant": 0 }
                        },
                        "renderConfig": {
                            "size": 3.0
                        }
                    },
                    {
                        "name": "Arrowheads",
                        "mark": "point",
                        "encoding": {
                            "shape": {
                                "field": "sin(x)",
                                "type": "quantitative",
                                "scale": {
                                    "type": "threshold",
                                    "domain": [-0.01, 0.01],
                                    "range": ["triangle-down", "diamond", "triangle-up"]
                                }
                            },
                            "size": { "value": 500 },
                            "strokeWidth": { "value": 0 }
                        }
                    }
                ]
            }
        ]
    }]
}
```

</div>
</div>

## Resolve
