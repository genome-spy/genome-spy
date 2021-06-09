# View Concatenation

The `vconcat` and `hconcat` composition operators place views side-by-side
either vertically or horizontally. The `vconcat` is practical for building
genomic visualizations with multiple tracks.

## Example

<div class="embed-example">
<div class="embed-container" style="height: 300px"></div>
<div class="embed-spec">

```json
{
  "data": { "url": "sincos.csv" },

  "vconcat": [
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

By default, all channels have independent scales and axes.
