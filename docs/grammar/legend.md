# Legend

Legends explain how visual channels such as `color`, `fill`, `stroke`, `shape`,
`size`, and `opacity` map data values to visual values. GenomeSpy creates
legends from encoding channels in the same spirit as Vega-Lite.

Legends are disabled by default in GenomeSpy to avoid changing existing
visualizations. Enable automatic legends with `config.legend.disable: false`, or
provide a channel-level legend object.

```json title="Enable legends globally"
{
  "config": {
    "legend": { "disable": false }
  }
}
```

Set `legend` to `null` on a channel to remove that channel's legend.

```json title="Remove one channel legend"
{
  "encoding": {
    "color": {
      "field": "group",
      "type": "nominal",
      "legend": null
    }
  }
}
```

## Symbol legends

Discrete encodings, such as nominal `color`, `fill`, `stroke`, and `shape`,
create symbol legends. Quantitative encodings on symbol-like channels such as
`size`, `opacity`, and `strokeWidth` show representative values.

EXAMPLE examples/docs/grammar/legend/symbol-legend.json height=300

## Gradient legends

Continuous quantitative color channels create gradient legends. The gradient
uses the same scale as the plotted data.

EXAMPLE examples/docs/grammar/legend/gradient-legend.json height=300

## Placement

The `orient` property controls where the legend is placed. Side legends are
placed outside the plot area. Corner legends are placed inside the plot area.

Supported orientations:

- `left`
- `right`
- `top`
- `bottom`
- `top-left`
- `top-right`
- `bottom-left`
- `bottom-right`

Use side orientations for normal plot chrome. Use corner orientations when the
legend should be placed over the data area. For inside legends, a translucent
background improves readability.

```json
{
  "legend": {
    "orient": "top-right",
    "backgroundFill": "white",
    "backgroundFillOpacity": 0.8,
    "padding": 4
  }
}
```

## Resolution

Legends participate in view resolution similarly to scales and axes. Use
`resolve.legend` in composed views to choose whether child views share one
legend or create independent legends.

When `resolve.legend` is not configured, legend resolution follows the
corresponding scale resolution.

```json
{
  "resolve": {
    "scale": { "color": "shared" },
    "legend": { "color": "shared" }
  }
}
```

Shared legend resolution is most useful when sibling views encode the same field
with a shared scale and should show a single collected legend.

EXAMPLE examples/docs/grammar/legend/shared-hconcat-legend.json height=360

## Titles

The legend title defaults to the channel title. Set `title` to override it, or
to `null` to remove it. The title can be placed on any side of the legend body
with `titleOrient`.

```json
{
  "legend": {
    "title": "Sample group",
    "titleOrient": "left",
    "titlePadding": 3
  }
}
```

## Properties

SCHEMA Legend

## Styling

Legend defaults can be configured with `config.legend`. A channel-level legend
object overrides the configured defaults for that legend.

```json
{
  "config": {
    "legend": {
      "disable": false,
      "orient": "right",
      "offset": 12,
      "labelFontSize": 11,
      "titleFontSize": 12
    }
  }
}
```

Named styles from `config.style` can also be referenced with `legend.style`.
GenomeSpy includes a built-in `track-bottom` legend style for compact
track-like layouts.

```json
{
  "legend": {
    "style": "track-bottom"
  }
}
```

### Config Properties

SCHEMA LegendConfig
