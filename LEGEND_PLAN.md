# Legend Plan

This document tracks the current legend implementation direction for GenomeSpy
Core. The initial milestone is now mostly implemented: simple local symbol
legends are generated from ordinary GenomeSpy marks and can be shown beside
simple plots.

## Current State

The first milestone targets `examples/core/marks/point/point2d.json`. The
example opts in to legends through config, encodes `Origin` redundantly with
`color` and `shape`, and renders a local right-oriented symbol legend.

Completed pieces:

- `legend` channel properties and `config.legend` defaults are wired through
  the config machinery.
- Legends are disabled by default for compatibility.
- Simple discrete symbol legends are created for nominal and ordinal non-
  positional channels when config enables legends or the channel has an
  explicit non-null `legend` definition.
- `legend: null` suppresses automatic legend creation.
- Legend entries are generated lazily from the explained scale resolution, so
  the legend follows data-domain updates.
- `LegendView` generates ordinary `point` and `text` marks, similar in spirit
  to `AxisView`.
- `measureText` and the internal `packLabels` transform compute entry layout.
- Generated legend scales use view `width` and `height` params so pixel-like
  positions are not stretched by the unit coordinate range.
- Right-oriented local legends are placed as `GridChild` chrome beside the plot.
- Redundant `shape` is merged into a primary color/fill/stroke symbol legend
  when both encode the same field.

Relevant commits include:

- `d1499ebf fix(core): use view size for generated legend layout`
- `1023084e fix(core): place generated legend titles at top`
- `28530d14 feat(core): merge redundant shape into symbol legends`

## Vega/Vega-Lite Summary

Vega-Lite mostly decides whether legends exist, applies defaults, merges
compatible legends, and emits Vega legend definitions. Vega handles final mark
generation and layout.

Vega builds symbol legends from ordinary scenegraph marks: a legend group
contains optional title and entry groups; each entry group contains a symbol and
label. Symbol properties can be scale-backed for channels such as fill, stroke,
shape, size, and opacity.

Horizontal layout in Vega relies on scenegraph bounds. Entry groups are
measured, then a grid layout computes column widths and row heights. With
`gridAlign: "each"`, varying label lengths are handled by advancing each column
by the widest entry in the previous column. GenomeSpy does not have that same
scenegraph bounds pass, so the current approach uses `measureText` followed by
`packLabels`.

When architecture, docs, defaults, or implementation details are copied or
closely adapted from the Vega projects, add a nearby code or documentation
comment noting that they are adapted from Vega:
[`vega/vega`](https://github.com/vega/vega/).

## Design Rationale

Legend generation and legend placement should remain separate:

- Scale resolution determines the scale, domain, and legend entries.
- A guide host determines where the legend is placed in the view hierarchy.

GenomeSpy view hierarchies can be complex, with hidden tracks, dynamically added
tracks, sample views, imported subtrees, and scales that are pulled toward
ancestors. A single root-level legend panel would often detach a legend from the
marks it explains. The current implementation therefore starts with local
legends hosted by the `GridChild` that owns the explained view.

## Remaining Near-Term Work

### Tighten Symbol Legend Behavior

- Confirm the visual result of `point2d.json` in the dev app after the redundant
  shape encoding.
- Improve base symbol styling for channels that do not encode both fill and
  stroke. The config already has `symbolBaseFillColor` and
  `symbolBaseStrokeColor`, but generated legends should apply them consistently.
- Decide whether `shape`-only legends should use `color`/`stroke` defaults that
  match point mark defaults.
- Add tests for explicit `legend: null` on redundant `shape` so it does not
  merge into the primary legend.
- Add tests for non-redundant color and shape fields. For now these should
  either create separate legends when orientations differ or fail clearly when
  they both target the same local orient.

### Legend Extent and Layout

- Replace the fixed perpendicular legend extent of 80 px with measured extent.
- Observe label/title bounds after data is ready, similar to the axis auto-
  extent pattern.
- Request layout reflow when measured legend extent changes.
- Keep right-oriented legends stable while adding support for left, top, and
  bottom orientations.
- Revisit horizontal legends once extent measurement is available. The current
  `packLabels` transform supports measured-width packing, but wrapping by
  available width should wait because it introduces layout feedback.

### Supported Legend Types

- Continue with symbol legends first.
- Add fill/stroke/shape/size/opacity combinations incrementally.
- Defer gradient legends for continuous color scales.
- Defer interactive legend filtering.

### Shared and Complex Placement

The current model intentionally does not append every legend to a shared root
container. Later versions can add:

- Merged legends for intentionally shared non-position scales.
- A computed common guide host for shared legends.
- Named guide areas.
- Explicit guide-area views.
- App-level legend panels.

## Future Named Guide Areas

Named guide areas remain a useful extension for complex applications and
publication layouts. A possible future shape:

```json
{
  "guideAreas": {
    "sample-legends": {
      "orient": "right",
      "direction": "vertical"
    }
  },
  "spec": {
    "encoding": {
      "color": {
        "field": "sampleTime",
        "type": "ordinal",
        "legend": {
          "area": "sample-legends"
        }
      }
    }
  }
}
```

Potential semantics:

- `legend.area` names a guide area.
- Area lookup walks upward through ancestor views.
- Explicit missing areas fail fast.
- Multiple live legends targeting the same area are stacked or packed there.
- Hidden views do not contribute legends.

This should not be required for the simple local-legend milestone.

## Testing Notes

Focused tests should continue to cover:

- Default config keeps legends hidden.
- `point2d.json` renders a right-side discrete legend for `Origin` when
  `config.legend.disable` is `false`.
- Legend spec generation for scale-backed symbol, title, and label layers.
- Redundant color/shape encodings merge into one symbol legend.
- `legend: null` disables generation.
- Legend defaults are resolved through `config.legend`.
- Horizontal packing handles labels with varying widths.
- Hidden views do not contribute legends.
- Layout reflow occurs when measured legend extent grows.

For layout-level tests, prefer existing hierarchy/layout helpers such as
`specToLayout(...)` or `renderToLayout(...)`.
