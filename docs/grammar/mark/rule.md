# Rule

Rule mark displays each data item as a line segment. Rules can span the whole
width or height of the view. Alternatively, they may have specific endpoints.

<div class="embed-example">
<div class="embed-container" style="height: 150px"></div>
<div class="embed-spec">

```json
{
    "tracks": [
        {
            "type": "SimpleTrack",
            "data": {
                "sequence": { "start": 0, "stop": 15, "as": "y" }
            },
            "mark": "rule",
            "encoding": {
                "x":     { "field": "y", "type": "quantitative" },
                "color": { "field": "y", "type": "nominal" }
            }
        }
    ]
}
```

</div>
</div>

!!! warning "It's actually a rectangle!"
    Currently, rule mark is just a specialization of Rect mark. This imposes
    some shortcomings, such as missing support for slanted lines and variable
    stroke widths.

## Channels

TODO, but in principle, the same as in [Rect mark](./rect.md).

## Properties

TODO, but in principle, the same as in [Rect mark](./rect.md) plus the following:

`size`
:   Type: Number

    The stroke width of the lines in pixels.

    **Default value:** `1`

`minLength`
:   Type: Number

    The minimum length of the rule. 
    The property translates to `minLength` or `minWidth` of Rect mark.

    **Default value:** `0`

## Examples

### Ranged rules

<div class="embed-example">
<div class="embed-container" style="height: 150px"></div>
<div class="embed-spec">

```json
{
    "tracks": [
        {
            "type": "SimpleTrack",
            "data": {
                "values": [
                    { "y": "A", "x": 2, "x2": 7 },
                    { "y": "B", "x": 0, "x2": 3 },
                    { "y": "B", "x": 5, "x2": 6 },
                    { "y": "C", "x": 4, "x2": 8 },
                    { "y": "D", "x": 1, "x2": 5 }
                ]
            },
            "mark": {
                "type": "rule",
                "size": 7
            },
            "encoding": {
                "y":     { "field": "y",  "type": "nominal" },
                "x":     { "field": "x",  "type": "quantitative" },
                "x2":    { "field": "x2" }
            }
        }
    ]
}
```

</div>
</div>