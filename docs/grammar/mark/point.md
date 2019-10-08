# Point

Point mark displays each data item as a symbol. Points are often used to create
a scatter plot. In the genomic context, they could represent, for example,
point mutations at genomic loci.

<div class="embed-example">
<div class="embed-container" style="height: 200px"></div>
<div class="embed-spec">

```json
{
    "tracks": [
        {
            "type": "SimpleTrack",
            "data": { "url": "../../../data/examples/sincos.csv" },
            "mark": "point",
            "encoding": {
                "x": { "field": "x", "type": "quantitative" },
                "y": { "field": "sin", "type": "quantitative" },
                "size": { "field": "x", "type": "quantitative" }
            }
        }
    ]
}
```

</div>
</div>

TODO: Everything

TODO: Size scaling on SampleTrack

## Examples

<div class="embed-example">
<div class="embed-container" style="height: 300px"></div>
<div class="embed-spec">

```json
{
    "tracks": [
        {
            "type": "SimpleTrack",

            "renderConfig": {
                "maxPointSizeRelative": 0.085,
                "maxMaxPointSizeAbsolute": 60
            },

            "data": {
                "sequence": { "start": 0, "stop": 200, "as": "z" }
            },

            "transform": [
                { "type": "formula", "expr": "datum.z % 10", "as": "y" },
                { "type": "formula", "expr": "floor(datum.z / 10)", "as": "x" }
            ],

            "mark": "point",

            "encoding": {
                "x":  { "field": "x", "type": "quantitative" },
                "y": { "field": "y", "type": "nominal" },
                "shape": { "field": "x", "type": "nominal" },
                "color": { "expr": "datum.x + datum.y", "type": "quantitative", "scale": { "scheme": "sinebow" } },
                "size": { "expr": "-sqrt(pow(datum.x - 9, 2) + pow(datum.y - 4.5, 2))", "type": "quantitative", "scale": { "range": [0, 1000]} },
                "strokeWidth": { "field": "y", "type": "quantitative", "scale": { "range": [0, 4] } },
                "gradientStrength": { "field": "x", "type": "quantitative", "scale": { "range": [0, 1] } }
            }
        }
    ]
}
```

</div>
</div>

## Zoom behavior

### Geometric zoom

<div class="embed-example">
<div class="embed-container" style="height: 300px"></div>
<div class="embed-spec">

```json
{
    "tracks": [{
        "type": "SimpleTrack",
        "data": {
            "sequence": { "start": 0, "stop": 200000, "as": "x" }
        },
        "transform": [
            { "type": "formula", "expr": "random() * 0.682", "as": "u" },
            {
                "type": "formula",
                "expr": "((datum.u % 1e-8 > 5e-9 ? 1 : -1) * (sqrt(-log(max(1e-9, datum.u))) - 0.618)) * 1.618 + sin(datum.x / 10000)",
                "as": "y"
            }
        ],
        "mark": "point",
        "encoding": {
            "x": { "field": "x", "type": "quantitative" },
            "y": { "field": "y", "type": "quantitative" },
            "size": { "value": 200 },
            "opacity": { "value": 0.6 }
        },
        "renderConfig": {
            "zoomLevelForMaxPointSize": 1200
        }
    }]
}
```

</div>
</div>

TODO

### Semantic zoom

TODO
