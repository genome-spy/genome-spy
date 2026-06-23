# Legend

Legends explain how visual channels such as `color`, `fill`, `stroke`, `shape`,
`size`, and `opacity` map data values to visual values. GenomeSpy creates
legends from encoding channels in the same spirit as Vega-Lite.

## Symbol legends

Discrete encodings, such as nominal `color`, `fill`, `stroke`, and `shape`,
create symbol legends. Quantitative encodings on symbol-like channels such as
`size`, `opacity`, and `strokeWidth` show representative values.

EXAMPLE examples/docs/grammar/legend/symbol-legend.json height=300

## Gradient legends

Continuous quantitative color channels create gradient legends. The gradient
uses the same scale as the plotted data.

EXAMPLE examples/docs/grammar/legend/gradient-legend.json height=300

## Configuration

Legend properties are usually placed in the encoding channel that creates the
legend:

```json
{
  "encoding": {
    "color": {
      "field": "group",
      "type": "nominal",
      "legend": {
        "title": "Sample group"
      }
    }
  }
}
```

In composed views with shared legend resolution, view-level
`legends.<channel>` can provide a shared location for the legend properties. See
[Resolution](#resolution).

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

Legends participate in view
[resolution](./composition/index.md#scale-axis-and-legend-resolution) similarly
to scales and axes. Use `resolve.legend` in composed views to choose whether
child views share one legend or create independent legends.

When `resolve.legend` is not configured, legend resolution follows the
corresponding scale resolution.

### `shared` legend

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

For shared legend resolutions, legend properties can also be placed at the view
level with `legends.<channel>`:

```json
{
  "legends": {
    "color": {
      "title": "Sample group",
      "orient": "right"
    }
  },
  "layer": [
    ...
  ]
}
```

A view-level legend config must map to one legend resolution. If the subtree has
multiple independent legends for the same channel, place the config closer to
the intended subtree or use local `encoding.<channel>.legend` settings. Do not
mix view-level `legends.<channel>` with participating channel-level legend
config for the same resolved legend.

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

## Disabling legends

Legends are created automatically for encodings that support them. Disable all
automatic legends with `config.legend.disable: true` in the root specification.

```json title="Disable legends globally"
{
  "config": {
    "legend": { "disable": true }
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

`disable` also accepts an expression reference. This is useful for parameterized
specifications that let the user show or hide all legends without rebuilding the
view.

EXAMPLE examples/docs/grammar/legend/reactive-disable.json height=340

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

### Track-like legends

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

Views with an `index` or `locus` x scale use `config.legendTrack` as an
intermediate default. These views usually form genome-browser-like horizontal
tracks where there is more room below each track than to the side of a dense
track stack. The default `config.legendTrack` style is therefore
`track-bottom`. Use `config.legend` to override those defaults globally, or a
channel-level `legend` object to override a single legend.

Clear this track-specific style at the root or in a subtree by setting
`config.legendTrack.style` to `null`:

```json
{
  "config": {
    "legendTrack": {
      "style": null
    }
  }
}
```

### Config Properties

SCHEMA LegendConfig
