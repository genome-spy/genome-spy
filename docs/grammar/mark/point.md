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

## Channels

In addition to standard [position](../encoding/index.md) channels and
`color`, `opacity`, and `strokeWidth` channels, point mark has the following
channels:

`size`
:   Type: Number

    The area of the point in pixels. In practice, the area is less because
    the shapes do not fill their rectangular container. Example: the diameter
    of a circle with the size of `100` is 10 (sqrt(100)) pixels.
    
    **Default value:** `100`

`shape`
:   Type: String

    One of `"circle"`, `"square"`, `"cross"`, `"diamond"`, `"triangle-up"`,
    `"triangle-down"`, `"triangle-right"`, or `"triangle-left"`.

    **Default value:** `"circle"`

`gradientStrength`
:   Type: Number

    Gradient strength controls the amount of the gradient eye-candy effect.
    Valid values are between `0` and `1`.

    **Default value:** `0`

## Properties

`geometricZoomBound`
:   Type: Number

    Enables [geometric zooming](#geometric-zoom).
    The value is the base two logarithmic zoom level where the maximum point
    size is reached.

    **Default value:** `0`

`maxRelativePointDiameter`
:   Type: Number

    When a faceted visualization (Sample Track) has tens or hundreds of subgroups,
    the individual views may be smaller than the diameter of the point marks.
    `maxRelativePointDiameter` property adjusts the scaling so that the
    largest possible point in the data is no larger than the specified fraction
    of the view height.

    **Default value:** `0.8`

`minAbsolutePointDiameter`
:   Type: Number

    The `minAbsolutePointDiameter` property works in concert with `maxRelativePointDiameter`.
    The property specifies in pixels the absolute lower limit of the diameter of
    the largest possible point in the data.

    **Default value:** `0.0`


## Examples

### Plenty of points

The example below demonstrates how the points can be varied by using
`shape`, `color`, `size`, `strokeWidth`, and `gradientStrength` channels.

<div class="embed-example">
<div class="embed-container" style="height: 300px"></div>
<div class="embed-spec">

```json
{
    "tracks": [
        {
            "type": "SimpleTrack",

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
                "size": { "expr": "-sqrt(pow(datum.x - 9, 2) + pow(datum.y - 4.5, 2))", "type": "quantitative", "scale": { "range": [0, 700]} },
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

Although points are infinitely small on the real number line, they have a
specific diameter on the screen. Thus, closely located points tend to overlap
each other. Decreasing the point size reduces the probability of overlap, but
in a zoomed-in view, the plot may become overly sparse.

Point mark provides two specific zooming behaviors that adjust the point size
and visibility based on the zoom level.

### Geometric zoom

Geometric zoom scales the point size down if the current zoom level is lower
than the specified level (bound). `geometricZoomBound` mark property enables
geometric zooming. The value is the negative base two logarithm of the
relative width of the visible domain. Example: `0`: (the default) full-size
points are always shown, `1`: when a half of the domain is visible, `2`: when
a quarter is visible, and so on.

The example below displays 200 000 semi-randomly generated points. The points
reach their full size when 1 / 2^10.5 of the domain is visible, which equals
about 1500X zoom.

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
        "mark": {
            "type": "point",
            "geometricZoomBound": 10.5
        },
        "encoding": {
            "x": { "field": "x", "type": "quantitative" },
            "y": { "field": "y", "type": "quantitative" },
            "size": { "value": 200 },
            "opacity": { "value": 0.6 }
        }
    }]
}
```

</div>
</div>

!!! tip
    You can use geometric zoom to improve rendering performance. Smaller points
    are faster to render than large points.

### Semantic zoom

TODO
