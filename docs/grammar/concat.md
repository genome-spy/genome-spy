# View Concatenation

The `concat` operator allows for building visualizations with multiple tracks.

## Example

<div class="embed-example">
<div class="embed-container" style="height: 200px"></div>
<div class="embed-spec">

```json
{
  "data": { "url": "sincos.csv" },

  "concat": [
    {
      "mark": "point",
      "encoding": {
        "x": { "field": "x", "type": "quantitative" },
        "y": { "field": "sin", "type": "quantitative" }
      }
    },
    {
      "mark": "point",
      "encoding": {
        "x": { "field": "x", "type": "quantitative" },
        "y": { "field": "cos", "type": "quantitative" }
      }
    }
  ]
}
```

</div>
</div>

## Resolve

The scales of the `x` channel are always shared. By default, all other
channels have independent scales.
