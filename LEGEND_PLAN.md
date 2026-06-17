# Legend Plan

This document tracks the current legend implementation direction for GenomeSpy
Core. The first implementation pass exists: local legends are generated from
ordinary GenomeSpy marks and can be shown beside simple plots. The next focus is
to prove and harden `GridChild` as the local legend host for layered plots,
including both outside-plot and inside-plot legend regions, before adding shared
guide areas or more ambitious placement models.

## Current State

The current implementation targets simple local legends hosted by the
`GridChild` that owns the explained view. Testbed examples include:

- `examples/core/legends/linear-gradient.json`,
  `examples/core/legends/log-gradient.json`, and
  `examples/core/legends/threshold-gradient.json` for scale-specific gradient
  behavior.
- `examples/core/legends/redundant-encoding.json` for discrete symbol legends
  that merge redundant color and shape encodings.
- `examples/core/legends/horizontal-stacked-bar.json` for discrete color
  legends on rect marks using aggregate and stack transforms.
- `examples/core/legends/bubble-health-income.json` for quantitative size
  legends using representative symbol sizes.
- `examples/core/lazy-data/bigwig.json` for dynamic quantitative color domains.

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
- Right-, left-, top-, and bottom-oriented local legends are placed outside the
  plot as `GridChild` chrome.
- Redundant `shape` is merged into a primary color/fill/stroke symbol legend
  when both encode the same field and resolved scale domain.
- Redundant shape merging respects `legend: null`, and non-redundant same-
  orient legends are kept separate and stacked locally.
- Shape-only, fill-only, stroke-only, and redundant color/shape symbol legends
  are covered by focused tests. Symbol base fill/stroke handling avoids
  unsupported CSS `transparent` constants in shader code while preserving
  color-driven strokes.
- Quantitative color/fill/stroke legends render as gradient legends built from
  ordinary `rect`, `rule`, and `text` marks.
- Gradient legends use the actual source scale for color and a local
  normalized positional scale for ramp/tick placement.
- Linear, logarithmic, threshold, quantize, square-root, power, and symlog
  quantitative color scales are covered by examples or focused tests.
  Non-linear tick and ramp positions follow the same normalized scale.
  Threshold legends include the two outer color buckets and align tick labels
  with threshold boundaries.
- Legend data sources listen to source scale domain changes so legends follow
  dynamic domains.
- Generated legend views suppress ordinary view strokes.
- Symbol legend labels and gradient tick labels use the channel `format`
  property where applicable. Gradient tick formatting reuses the same
  `tickFormat` machinery as axes.
- Legend title and label text limits are applied using the same font metrics as
  rendered text. Symbol label packing measures the limited label text.
- Quantitative size legends use variable symbol sizes, inherit relevant point
  mark styling, keep differently sized symbols center-aligned, and line up
  labels against a shared column label position.
- Rect mark color legends use square symbol swatches.
- Legend candidates are collected through an internal `LegendResolution`,
  modeled after `AxisResolution`, before `GridChild` materializes them as
  local legends.
- Multiple outside legends with the same local side orient are stacked outward
  from the plot, after any axis on the same side.

## Vega/Vega-Lite Summary

Vega-Lite mostly decides whether legends exist, applies defaults, merges
compatible legends, and emits Vega legend definitions. Vega handles final mark
generation and layout.

Vega-Lite has explicit guide resolution for both axes and legends. Its
`resolve` model includes `scale`, `axis`, and `legend`; legend parsing in
`tmp/vega-lite/src/compile/legend/parse.ts` mirrors the axis parser by parsing
unit legend components, resolving child legends as shared or independent, and
falling back to independent legends when merging fails.

Vega builds symbol legends from ordinary scenegraph marks: a legend group
contains optional title and entry groups; each entry group contains a symbol and
label. Symbol properties can be scale-backed for channels such as fill, stroke,
shape, size, and opacity.

Vega supports side legend orients (`left`, `right`, `top`, `bottom`), inside
corner orients (`top-left`, `top-right`, `bottom-left`, `bottom-right`), and
`none`. Side orients are placed outside the chart area. Corner orients are
placed inside the chart area using an inward offset. Vega does not stack corner
legends by default; multiple legends targeting the same corner can be
superimposed unless legend layout config changes that behavior.

Vega-Lite passes these orients through to Vega and sets direction defaults:
top/bottom legends default to horizontal, left/right and `none` use Vega's
vertical default, and corner legends default to horizontal for gradient legends
but vertical for symbol legends.

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
legends hosted by the `GridChild` that owns the explained plot area.

`GridChild` should remain the default legend host because it already owns plot
chrome and local plot geometry: axes, gridlines, scrollbars, padding, overhang,
and the viewport rectangle. This is especially important for `LayerView`: a
layered plot represents one plot area with multiple visual contributors, and
the surrounding `GridChild` is the natural place to host legends for all views
inside that layer.

## Next Milestone: GridChild-Hosted Layered Legends

The next milestone is to demonstrate that the existing local `GridChild`
placement model works for layered plots, then add inside-plot corner legend
regions to the same host. This should happen before adding named guide areas,
shared legend panels, or app-level legend placement.

Acceptance criteria:

- Simple symbol and gradient legends keep working with local right-oriented
  placement.
- A root or nested `LayerView` can contribute legends through the surrounding
  `GridChild`.
- `orient: "left"`, `"right"`, `"top"`, and `"bottom"` remain outside-plot
  regions that reserve `GridChild` overhang.
- `orient: "top-left"`, `"top-right"`, `"bottom-left"`, and `"bottom-right"`
  become inside-plot regions that reserve no external overhang.
- Multiple legends targeting the same `GridChild` region are stacked or
  concatted predictably. GenomeSpy should not copy Vega's default corner
  superimposition behavior.
- The implemented channel and scale coverage is explicit and tested.
- Missing or unsupported combinations fail clearly or intentionally do not
  create a legend; they should not silently produce misleading legends.
- Legend defaults, labels, titles, symbols, and gradient ticks are close to
  Vega behavior where GenomeSpy has matching concepts.

### Vega Parity Gaps To Check

Compare current behavior against Vega/Vega-Lite and decide which pieces belong
in the local-legend milestone:

- Title behavior:
  - `titleOrient` is not implemented; generated legends currently place titles
    above the legend body.
- Label behavior:
  - Discrete threshold labels should describe boundaries/ranges in a
    Vega-like way if plain boundary labels are not sufficient.
- Symbol behavior:
  - Base symbol fill/stroke defaults are applied when the explained channel
    does not provide that property.
  - Shape-only, fill-only, stroke-only, and redundant color/shape legends are
    visually sensible.
  - Symbol size, stroke width, and shape defaults are compatible with point
    mark defaults and Vega-inspired legend defaults.
- Gradient behavior:
  - Linear and log ramps use the source scale for color and stable local
    positioning.
  - Threshold ramps show all buckets, including values below the first
    threshold and above the last threshold.
  - Tick values and tick labels align with ramp color boundaries.
  - Domain updates follow source scale changes without adding a second smooth
    transition.
- Layout behavior:
  - Legend views do not inherit ordinary view strokes.
  - Top/bottom legends use horizontal layout and reserve vertical overhang.
  - Left/right legends use vertical layout and reserve horizontal overhang.
  - Corner legends are not implemented yet; they should render inside the plot
    area and reserve no overhang.
  - Multiple legends targeting the same local region stack predictably.

### Channel Coverage To Support

Legend creation should consider non-positional scale-backed channels only.
Positional `x`, `y`, `x2`, and `y2` continue to be explained by axes, not
legends.

Active channels:

- `color`: primary color legend channel. Supports symbol legends for discrete
  fields and gradient legends for quantitative color scales.
- `fill`: same legend behavior as `color` where marks use fill directly.
- `stroke`: same legend behavior as `color` where marks use stroke directly.
- `shape`: symbol legend for discrete fields. If it is redundant with
  `color`, `fill`, or `stroke`, it may merge into that primary symbol legend.
- `size`: symbol legend for discrete and quantitative fields. Quantitative size
  uses representative tick values, not a gradient legend.

Deferred channels:

- `opacity`, `fillOpacity`, `strokeOpacity`: symbol legend candidates. Treat as
  lower priority than color/shape/size because legibility and base styling need
  careful defaults.

Unsupported scale-backed non-position channels:

- `strokeWidth`, `angle`, `dx`, and `dy` do not currently have a clear legend
  representation.

Channel behavior to document and test:

- `legend: null` suppresses the legend for the specific channel.
- Redundant channels respect `legend: null`; for example, `shape` should not
  merge into a color legend when `shape.legend` is `null`.
- Non-redundant channels with the same orient are kept as separate local
  legends and stacked outward from the plot.

### Scale Type Coverage To Support

Discrete symbol legends:

- `nominal` and `ordinal` fields using ordinal, point, or band-like discrete
  scales.
- Discrete color/fill/stroke/shape scales should use scale domain values as
  entries and scale outputs as mark encodings.

Quantitative gradient legends:

- `linear`
- `log`
- `pow`
- `sqrt`
- `symlog`
- `threshold`, with explicit outer buckets and boundary-aligned labels.

Discretizing gradient legends:

- `quantize` color legends use bucket boundaries from the scale and align
  labels with those boundaries.

Quantitative symbol legends:

- `size` with representative values and variable symbol sizes.
- `opacity` and related opacity channels only after base styling is readable.

Unsupported or deferred:

- `quantile`, which GenomeSpy does not currently support as a scale type.
- `time` and `utc` scales, which GenomeSpy does not currently support.
- Binned legends, unless existing scale metadata exposes bin boundaries cleanly.
- Interactive legend filtering.
- Shared legends for intentionally shared scales.
- Root-level or named-area legend placement.

### Completed Channel And Scale Steps

- Legend creation now uses an explicit channel classifier instead of ad hoc
  type checks.
- `color`, `fill`, and `stroke` are handled as color-like legend channels.
- Quantitative color-like channels use gradient legends; nominal/ordinal
  color-like channels use symbol legends.
- Shape-only symbol legends are supported.
- Redundant `shape` merging checks matching fields and matching resolved
  domains, and respects `legend: null`.
- Rect-based color legends use square symbol swatches. The
  `horizontal-stacked-bar.json` example has been manually checked as a compact
  aggregate-plus-stack testbed for this behavior.
- Continuous gradient legend positions are covered for `sqrt`, `pow`, and
  `symlog`, including non-default power exponents and symlog constants.
- Quantize gradient legends use one ramp segment per scale bucket and place
  labels on quantize thresholds.
- Discrete and quantitative `size` symbol legends are supported. Quantitative
  size legends use representative tick values from the source scale. The
  `bubble-health-income.json` example has been manually checked and is a good
  local testbed for size-based legends.
- Deferred channels such as opacity do not create accidental legends before
  their representation is designed.

### Completed Title And Label Steps

Completed with behavioral tests and generated hierarchy inspection:

- Title derivation:
   - `legend.title` overrides channel field title and field name,
   - channel `title` is used before raw field name,
   - `title: null` suppresses the title.
- Title styling and spacing:
   - `titlePadding` affects generated title view height,
   - `titleColor`, `titleFont`, `titleFontStyle`, `titleFontWeight`, and
     `titleFontSize` pass through to the title text mark.
- Label styling:
   - `labelFontSize`, `labelColor`, `labelFont`, `labelFontStyle`,
     `labelFontWeight`, `labelAlign`, and `labelBaseline` pass through to
     generated label marks.
- Formatting:
   - channel `format` affects symbol legend labels,
   - channel `format` affects gradient tick labels through the existing
     axis-style `tickFormat` helper.

### Internal Legend Resolution

The first internal legend-resolution pass is implemented. It is modeled more
closely after `AxisResolution` than `ScaleResolution`: scales still own domain
and scale-instance behavior, while legend resolution owns guide-member
aggregation and arbitration.

This follows the Vega-Lite architecture at a high level. Vega-Lite resolves axes
and legends separately from scales, even though guide resolution depends on the
resolved scale. GenomeSpy keeps the same conceptual split while using its own
runtime view/dataflow architecture.

Implemented behavior:

- `resolutionPlanner` collects non-positional scale-backed legend candidates
  for supported channels and registers them with an internal legend resolution.
- `LegendResolution` owns `legend: null` suppression, default/config merging,
  title derivation, legend type classification, source scale lookup, and
  redundant `shape` merging into compatible color/fill/stroke legends.
- Legend candidates are registered after scales are resolved, so legend
  resolution can use the actual `ScaleResolution`.
- `GridChild` materializes resolved legend definitions into `LegendView`s and
  remains responsible for local placement and overhang.
- Local placement remains unchanged conceptually: each `GridChild` hosts
  legends for the views it owns.
- Multiple resolved outside legends with the same side orient are stacked
  locally instead of rejected.
- Legend views remain materialized, but their local overhang and rendering are
  linked to the current visibility of the non-chrome participants in their
  `LegendResolution`.

Do not add a public `resolve.legend` spec surface yet. A public legend
resolution API can be designed later if shared/root/named-area legends need it.

Remaining resolution follow-ups:

1. Decide whether shared non-position scales should eventually merge legends
   across sibling `GridChild`s or remain local until named guide areas exist.
2. Keep inherited symbol styling deterministic by using the first contributing
   source view for now; revisit only if real multi-view conflicts appear.
3. Add one focused behavior test for a non-redundant same-orient pair such as
   color plus quantitative size if the existing same-orient test does not cover
   enough user-visible behavior.

### Remaining Channel And Scale Implementation Steps

Implement remaining channel and scale support in small, verifiable slices. Each
slice should add one or two behavioral tests or stable example specs before the
implementation change.

1. Investigate opacity legends before enabling them:
   - check `opacity`, `fillOpacity`, and `strokeOpacity` encoder behavior,
   - choose base fill/stroke colors that remain visible over the default
   background,
   - decide whether quantitative opacity should use sampled symbol entries or
   stay deferred.
2. Harden threshold legends:
    - keep outer buckets visible,
    - align labels with threshold boundaries,
    - decide whether labels should remain plain boundary labels or become
      Vega-like range labels such as `< 20` and `>= 100`.
3. Add a supported-matrix test group:
    - one focused test for each supported channel/type combination,
    - one suppression test for `legend: null`,
    - one unsupported/deferred case that verifies no misleading legend is
      created.
4. Update examples only when they serve as useful manual testbeds:
    - keep `examples/core/legends/` small and test-like,
    - avoid broad example churn outside explicit legend fixtures.

### Orientation And Layout Tasks

1. Add a layered-plot legend example and focused tests:
   - root `LayerView` inside the implicit root `GridView`,
   - one outside legend hosted by the surrounding `GridChild`,
   - one inside-corner legend hosted by the same `GridChild`,
   - enough manual-test styling to see whether legends are stacked and placed
     correctly.
2. Extend `LegendOrient` with the inside-corner values:
   - `top-left`,
   - `top-right`,
   - `bottom-left`,
   - `bottom-right`.
   Defer `none` until custom absolute legend positioning is explicitly needed.
3. Make `LegendView` generate orientation-aware body specs:
   - right/left: vertical title plus vertical body,
   - top/bottom: horizontal body, with title placement matching the supported
     `titleOrient` subset,
   - corner symbol legends: vertical by default,
   - corner gradient legends: horizontal by default, following Vega-Lite.
4. Teach `GridChild` to distinguish side and corner regions:
   - side regions place legends outside the plot and reserve overhang,
   - corner regions place legends inside `viewportCoords` and reserve no
     overhang,
   - multiple legends in the same side or corner region are stacked using the
     existing concat-like legend composition approach.
5. Replace the fixed perpendicular legend extent with measured or derived
   extent:
   - short term: derive extent from configured gradient thickness/labels and
     measured symbol labels,
   - longer term: observe bounds after data is ready and request reflow, similar
     to axis auto-extent.
6. Keep horizontal symbol packing deterministic. The current `packLabels`
   transform can measure varying label widths; wrapping by available width
   should wait until layout feedback is explicit.
7. Add layout snapshots for side and corner orientations using small stable
   examples.

### Robustness Tasks

1. Audit legend creation against all scale-backed channels and decide whether
   each should create a symbol legend, gradient legend, or no legend.
2. Add test examples or focused specs for the supported channel/scale matrix.
3. Add focused tests for same-orient stacking if real examples reveal gaps in
   current coverage.
4. Verify dynamic domains with a scale that updates after initial render.
5. Verify legends do not contribute to source scale domains while still using
   the actual source scale.
6. Keep tests behavioral. Prefer layout snapshots and rendered hierarchy checks
   over tests that duplicate generated spec internals.

Suggested focused checks:

```bash
npx vitest run packages/core/src/view/gridView/gridView.test.js packages/core/layout.test.js packages/core/examples.test.js --testNamePattern 'examples/core/legends'
npm --workspaces run test:tsc --if-present
```

### Shared and Complex Placement

The current model intentionally does not append every legend to a shared root
container. For now, a root `vconcat` with multiple unit children should keep
local child legends unless the spec later gains an explicit way to request a
container-level guide host. Do not infer collected placement merely because
multiple children happen to have legends.

Later versions can add:

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

## Refactoring Sprint

These refactors should stay behavior-preserving and small enough to commit one
at a time.

Completed:

- Simplified legend resolution member shape.
- Moved legend definition creation into `LegendResolution`.
- Extracted `GridChild` legend construction and per-orient legend bookkeeping
  into `gridChildLegends.js`.
- Extracted local legend placement and rendering into `legendLayout.js`.
- Organized `gridViewLegend.test.js` into behavior-focused `describe` blocks
  without splitting it into more files.
- Pruned the most exhaustive generated-mark style assertions to representative
  checks.

## Testing Notes

Focused tests should continue to cover:

- Default config keeps legends hidden.
- `point2d.json` renders a right-side discrete legend for `Origin` when
  `config.legend.disable` is `false`.
- Legend spec generation for scale-backed symbol, title, and label layers.
- Redundant color/shape encodings merge into one symbol legend.
- Quantitative heatmap color produces a gradient legend when legends are
  enabled.
- `legend: null` disables generation.
- Legend defaults are resolved through `config.legend`.
- Horizontal packing handles labels with varying widths.
- Hidden views do not contribute legends.
- Layout reflow occurs when measured legend extent grows.

For layout-level tests, prefer existing hierarchy/layout helpers such as
`specToLayout(...)` or `renderToLayout(...)`.
