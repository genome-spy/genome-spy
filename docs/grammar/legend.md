# Legend

Legends explain how visual channels such as `color`, `fill`, `stroke`, `shape`,
`size`, and `opacity` map data values to visual values. GenomeSpy creates
legends from encoding channels in the same spirit as Vega-Lite.

## Symbol legends

Discrete encodings, such as nominal `color`, `fill`, `stroke`, and `shape`,
create symbol legends. Quantitative encodings on symbol-like channels such as
`size`, `opacity`, and `strokeWidth` show representative values.

EXAMPLE examples/docs/grammar/legend/symbol-legend.json height=300

Symbol styling can be set independently of the data marks. For example,
`"legend": { "symbolOpacity": 1 }` keeps a category key opaque while hover or
selection interactions dim the marks. The symbol properties override inherited
mark and encoding styles; a channel that the legend explains still uses its
scale. Thus `symbolSize` sets the symbol area in a color legend, while a size
legend retains the sizes represented by its scale.

These properties can also be set under `config.legend` for all legends.

## Gradient legends

Continuous quantitative color channels create gradient legends. The gradient
uses the same scale as the plotted data.

EXAMPLE examples/docs/grammar/legend/gradient-legend.json height=300

The ramp fills available space when its direction is parallel to its legend
region. Otherwise it uses a natural length of 200 pixels. Set
`gradientLength` for a fixed ramp. The other gradient properties adjust its
appearance and desired tick density:

```json
{
  "legend": {
    "gradientLength": 160,
    "gradientThickness": 16,
    "gradientOpacity": 0.8,
    "gradientStrokeColor": "#666",
    "gradientStrokeWidth": 1,
    "tickCount": 4
  }
}
```

Explicit `values` determine the ticks when provided and take precedence over
`tickCount`.

## Interactive legends

Legend bindings update [selection parameters](parameters.md#selection-parameters).
This example combines a categorical sex selection with a body-mass range to
highlight matching penguins. Click a sex entry and brush the body-mass ramp to
explore their intersection:

EXAMPLE examples/docs/grammar/legend/interactive-legends.json height=350

!!! disclaimer ""

    Data: [Palmer Penguins](https://allisonhorst.github.io/palmerpenguins/), collected by Kristen Gorman and Palmer Station Antarctica LTER (CC0), via `vega-datasets`. Records with missing or unknown sex are excluded.

The example uses an `and` [condition](conditional-encoding.md#combining-selections)
to dim penguins outside either selection. Empty selections match all rows, so
each legend can also be used independently. Selections can instead drive
[filter transforms](transform/filter.md) to remove rows from the dataflow.

### Categorical selections

Add `bind: "legend"` to a [categorical point selection](parameters.md#categorical-point-selection)
to select categories through its symbol legend. In the example, the `sex`
parameter projects the `shape` channel:

```json
{
  "name": "sex",
  "select": { "type": "point", "encodings": ["shape"], "toggle": true },
  "bind": "legend"
}
```

Click an entry to select its category and Shift-click to toggle categories.
`select.toggle: false` restricts selection to one category. Unselected symbols
and labels use 35% of their normal opacity; an empty selection shows all entries
normally.

An unmodified background click clears **all categorical legend-bound selections**,
including independent and collected legends. Other selections keep their own
clearing behavior. Non-interactive marks do not block this reset; legend titles,
padding, and spacing remain inert. Default double-click clearing is disabled.

Bindings require one nominal or ordinal `color`, `fill`, `stroke`, or `shape`
field with a discrete scale and an enabled symbol legend. Each shared legend
binds one selection, and its declarations must agree on `select.clear`.
Independent legends can use local selections or compatible `push: "outer"`
declarations. Collecting legends changes placement without changing selection
ownership.

Plot input is disabled by default. Add `select.on: "pointerover"` to the `sex`
selection to enable plot hover alongside legend clicks. Hovering without Shift
replaces the selected category; Shift-click toggles it.
Custom `select.clear` events and filters apply to both legend entries and enabled
plot input. `select.clear: false` disables these events while retaining the global
background reset.

!!! note "Vega-Lite compatibility"

    The `bind: "legend"` form follows Vega-Lite's grammar. Field projections,
    object-valued legend event bindings, and expression-valued toggling are not
    supported.

### Numeric ranges

Bind an interval selection to a continuous quantitative `color`, `fill`, or
`stroke` legend. The example's `body_mass` parameter brushes the body-mass color
scale:

```json
{
  "name": "body_mass",
  "select": { "type": "interval", "encodings": ["color"] },
  "bind": "legend"
}
```

Drag the ramp to create a range, drag the brush to move it, and use the wheel to
resize. Double-click to clear; clicking outside the brush without dragging also
clears it. `select.on`, `select.clear`, and `select.zoom` customize these events
without enabling a plot brush for the color component.

Ranges include the lower endpoint and exclude the upper endpoint. Brushing to
the numeric maximum removes the upper limit: `>= 5000` includes penguins weighing
5000 g or more, including values above the displayed maximum. Moving or resizing
inward restores a finite upper bound.
Brushing preserves the color domain; domain changes preserve stored bounds and
clip only the visible brush. Explicit dataflow filtering can still affect domains.

Predicates test raw numeric values from the consuming view's same channel.
Use `project: {color: "fill"}` to target another quantitative color input.
An initial range uses `value: {color: [3500, 5000]}`; an upper endpoint of
`"Infinity"` removes the upper limit. Runtime APIs use numeric `Infinity`.

Style the brush with `select.mark`, using the same rect appearance properties as
a [positional interval brush](parameters.md#interval-selection). Expressions
resolve in the selection's declaring scope. The default outline and glow follow
the theme's foreground and background colors, with white as the glow fallback
for transparent backgrounds. Set shared defaults with
`config.style["gradient-selection-brush"]`.

Clearing hides the range readout while reserving its space to keep layout stable.
Set `legend.selectionLabel: false` to hide it and reclaim the space, or use
`config.legend.selectionLabel: false` globally. Ticks and brushing remain available.

Bindings require an unconditional quantitative field and a monotonic, invertible
continuous scale, such as linear or logarithmic. Discrete color buckets are
unsupported. Each shared or collected legend binds one selection with compatible
event and brush settings. Compatible `push: "outer"` declarations can share bounds
across independent scales and differently oriented ramps.

!!! note "Vega-Lite compatibility"

    Gradient interval legend binding is a GenomeSpy extension to Vega-Lite's
    symbol-legend binding.

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
It does not change how entries are arranged. Set `direction` to `"horizontal"`
when horizontal entries are wanted.

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

### Multiple legends in a region

When several complete legends share an orientation, left and right regions
stack them vertically by default. Top, bottom, and corner regions arrange them
horizontally. Configure all regions or one orientation with
`config.legend.layout`:

```json
{
  "config": {
    "legend": {
      "layout": {
        "direction": "vertical",
        "top": { "direction": "horizontal" },
        "right": { "anchor": "middle" }
      }
    }
  }
}
```

Region layout is separate from `legend.direction`: region `direction` arranges
complete legends, while `legend.direction` arranges entries within one legend.
For external orientations, `anchor` positions the complete stack along the
plot edge using `"start"` (the default), `"middle"`, or `"end"`. Corner legends
remain anchored to their specified corner.

External regions wrap complete legends by default when their minimum sizes do
not fit beside the plot. A horizontal region fills rows from left to right; a
vertical region fills columns from top to bottom. Set `wrap` to `false` in the
region layout to keep a single row or column. Inside-corner regions do not wrap.

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
with a shared scale and should show a single legend.

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

A view-level legend declaration must map to one legend resolution. If the
subtree has multiple independent legends for the same channel, place the
declaration closer to the intended subtree or use local
`encoding.<channel>.legend` properties. Do not mix view-level
`legends.<channel>` with participating channel-level legend properties for the
same resolved legend.

When nested view-level legend declarations target the same resolution, the
ancestor declaration shadows the whole descendant declaration; their
properties are not merged. Declarations in separate sibling subtrees remain
ambiguous and cause an error.

### `collected` legends

Use `"collected"` to place complete descendant legends around a composition.
This is useful in dense matrix-like layouts where legends beside every child
would fragment the layout, but the underlying scales must remain distinct.
Collection changes only layout. Legend resolution continues to follow the
corresponding scale resolution:

- Children with a shared scale produce one shared legend at the collector.
- Children with independent scales produce separate legends at the collector.
- Independent legends are not merged or deduplicated.

```json
{
  "resolve": {
    "scale": { "color": "independent" },
    "legend": { "color": "collected" }
  }
}
```

The nearest ancestor that declares `"collected"` lays out the legends. Use
`"default": "collected"` to collect every legend channel. Set a channel to
`"excluded"` on a view or composition to keep that legend at its normal local
or shared owner and prevent collection by outer ancestors.

EXAMPLE examples/docs/grammar/legend/collected-legends.json height=200

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
GenomeSpy includes a built-in `track-bottom-legend` style for compact
track-like layouts. It places the title to the left of horizontally arranged
entries.

```json
{
  "legend": {
    "style": "track-bottom-legend"
  }
}
```

Views with an `index` or `locus` x scale use `config.legendTrack` as an
intermediate default. These views usually form genome-browser-like horizontal
tracks where there is more room below each track than to the side of a dense
track stack. The default `config.legendTrack` style is therefore
`track-bottom-legend`. Use `config.legend` to override those defaults globally,
or a channel-level `legend` object to override a single legend. The old
`track-bottom` name remains as a compatibility alias.

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

## Properties

SCHEMA Legend

### Config Properties

SCHEMA LegendConfig
