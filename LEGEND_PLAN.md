# Legend Plan

This document tracks the remaining GenomeSpy Core legend work. The initial
legend implementation exists: legends are generated from ordinary GenomeSpy
marks, resolved through an internal `LegendResolution`, and hosted locally by
the `GridChild` that owns the explained plot area.

The current goal is to harden this local legend model, keep behavior close to
Vega/Vega-Lite where GenomeSpy has matching concepts, and defer shared or
root-level guide areas until there is a concrete need.

## Current State

Implemented behavior:

- Legends are disabled by default for compatibility and enabled through
  `config.legend.disable: false` or explicit non-null channel legends.
- Legend defaults are resolved through the config machinery.
- `legend: null` suppresses automatic legend creation for that channel.
- Legend candidates are collected by an internal `LegendResolution`, modeled
  after `AxisResolution`.
- `LegendResolution` owns default/config merging, title derivation, legend type
  classification, source scale lookup, redundant shape merging, and visibility
  linkage to contributing views.
- `GridChild` materializes resolved legends as local `LegendView`s and owns
  side/corner placement, overhang, stacking, and rendering order.
- Legends are generated from ordinary `point`, `rect`, `rule`, and `text`
  marks, similar in spirit to `AxisView`.
- Legend entries and gradient samples are generated from the actual explained
  scale resolution, so legends follow dynamic domain changes.
- Generated legend views suppress ordinary view strokes and render above plot
  data.
- Legend view backgrounds are configurable through `config.legend` or per-
  legend properties.
- `legend.offset` follows Vega semantics as the external displacement from the
  plot edge, while `legend.padding` is internal padding around legend content.
- `Legend.orient` supports side orients (`left`, `right`, `top`, `bottom`),
  inside-corner orients (`top-left`, `top-right`, `bottom-left`,
  `bottom-right`), and init-only `ExprRef` values for template use.
- `Legend.titleOrient` supports top, bottom, left, and right title placement.
- Multiple legends targeting the same local side or corner region are stacked
  predictably by `GridChild`; GenomeSpy intentionally does not copy Vega's
  default corner superimposition behavior.
- Stacked legends remain instantiated but inactive legend children collapse
  when all contributing views for that legend are hidden.
- Right/left legends use vertical layout; top/bottom legends use horizontal
  layout; corner symbol legends default to vertical layout.
- Vertical gradient legends can fill available container height.

Supported legend channels:

- `color`, `fill`, and `stroke` create symbol legends for discrete fields and
  gradient legends for quantitative fields.
- `shape` creates symbol legends for discrete fields and can merge into a
  compatible color/fill/stroke legend when field and resolved domain match.
- `size`, `opacity`, `fillOpacity`, and `strokeOpacity` create symbol legends
  for discrete and quantitative fields.
- Rect mark color legends use square swatches.
- Quantitative size legends use representative tick values, variable symbol
  sizes, center-aligned symbols, and a shared label column.

Supported scale behavior:

- Discrete symbol legends use scale domain values as entries.
- Linear, log, pow, sqrt, symlog, threshold, and quantize quantitative
  color-like scales are supported by gradient legends.
- Non-linear gradient ticks and ramp positions use a matching normalized local
  positional scale.
- Threshold legends include outer buckets and align labels with boundaries.
- Quantize legends use one ramp segment per bucket and labels at quantize
  thresholds. The underlying quantize GPU implementation is partial and tracked
  separately in GitHub issue #336.

Text, formatting, and styling:

- Legend title derivation respects `legend.title`, channel `title`, field
  title, field name, and `title: null`.
- Title styling, title padding, label styling, and label limits are wired.
- Symbol labels and gradient tick labels use channel `format` where
  applicable. Gradient tick formatting reuses the axis `tickFormat` helper.
- Symbol legends follow Vega-Lite's constant-vs-scale-backed style behavior:
  constant mark color/fill/stroke styling is inherited, but unrelated
  scale-backed color/fill/stroke encodings are neutralized in other symbol
  legends so, for example, a size legend does not appear to explain color.
- Legends support named `style` references through the config machinery. A
  built-in `track-bottom` style exists, but using inherited styles from
  config buckets such as `config.legend.style` is blocked by GitHub issue #414.
- `measureText`, `truncateText`, and `packLabels` support deterministic symbol
  label placement without relying on a scenegraph bounds pass.

Current testbed examples:

- `examples/core/legends/linear-gradient.json`
- `examples/core/legends/log-gradient.json`
- `examples/core/legends/threshold-gradient.json`
- `examples/core/legends/quantize-gradient.json`
- `examples/core/legends/redundant-encoding.json`
- `examples/core/legends/horizontal-stacked-bar.json`
- `examples/core/legends/bubble-health-income.json`
- `examples/core/legends/layered-legend-regions.json`
- `examples/core/lazy-data/bigwig.json`

## Vega/Vega-Lite Notes

Vega-Lite mostly decides whether legends exist, applies defaults, merges
compatible legends, and emits Vega legend definitions. Vega handles final mark
generation and layout.

Vega-Lite has explicit guide resolution for both axes and legends. Its
`resolve` model includes `scale`, `axis`, and `legend`; legend parsing in
`tmp/vega-lite/src/compile/legend/parse.ts` mirrors the axis parser by parsing
unit legend components, resolving child legends as shared or independent, and
falling back to independent legends when merging fails.

Vega builds symbol legends from scenegraph marks: a legend group contains an
optional title and entry groups; each entry group contains a symbol and label.
Symbol properties can be scale-backed for channels such as fill, stroke,
shape, size, and opacity.

Vega-Lite adds mark-style arbitration before emitting Vega legends. In
`compile/legend/encode.ts`, constant mark styling is carried into symbol
legends, but scale-backed color/fill/stroke encodings that represent another
field are neutralized in non-color legends. GenomeSpy follows this behavior for
local symbol legends.

Vega supports side legend orients (`left`, `right`, `top`, `bottom`),
inside-corner orients (`top-left`, `top-right`, `bottom-left`,
`bottom-right`), and `none`. Side orients are placed outside the chart area.
Corner orients are placed inside the chart area using an inward offset. Vega
does not stack corner legends by default; GenomeSpy stacks them locally because
layered plots commonly have multiple local legends.

Vega-Lite passes these orients through to Vega and sets direction defaults:
top/bottom legends default to horizontal, left/right and `none` use Vega's
vertical default, and corner legends default to horizontal for gradient legends
but vertical for symbol legends.

Horizontal layout in Vega relies on scenegraph bounds. Entry groups are
measured, then a grid layout computes column widths and row heights. With
`gridAlign: "each"`, varying label lengths are handled by advancing each column
by the widest entry in the previous column. GenomeSpy does not have the same
scenegraph bounds pass, so the current implementation uses measured text plus
internal layout transforms.

When architecture, docs, defaults, or implementation details are copied or
closely adapted from the Vega projects, add a nearby code or documentation
comment noting that they are adapted from Vega:
[`vega/vega`](https://github.com/vega/vega/).

## Design Rationale

Legend generation and legend placement should remain separate:

- Scale resolution determines the scale, domain, and scale instance.
- Legend resolution determines which guides should exist and which views
  contribute to them.
- `GridChild` determines where local legends are placed in the layout
  hierarchy.

GenomeSpy view hierarchies can be complex, with hidden tracks, dynamically
added tracks, imported subtrees, and scales that are pulled toward ancestors. A
single root-level legend panel would often detach a legend from the marks it
explains. Local `GridChild` hosting keeps legends near the plot area they
describe and naturally handles `LayerView`, where multiple visual contributors
share one plot area.

Do not add a public `resolve.legend` spec surface yet. A public legend
resolution API can be designed later if shared/root/named-area legends need it.

## Remaining Work

### Vega Parity And Behavior

- Decide whether threshold and quantize labels should remain plain boundary
  labels or become Vega-like range labels such as `< 20` and `>= 100`.
- Keep linear/log/pow/sqrt/symlog/threshold/quantize gradient behavior aligned
  with the source scale, especially after dynamic domain updates.
- Keep multi-view inherited symbol styling deterministic by using the first
  contributing source view for now; revisit arbitration only if real
  multi-view conflicts appear.
- Track-specific defaults should remain explicit for now. A future
  `config.track.legend` bucket is tracked in GitHub issue #415 and depends on
  the inherited style-resolution fix in #414.
- Verify unsupported or deferred combinations fail clearly or intentionally do
  not create a legend.

### Vega/Vega-Lite Property Gaps

GenomeSpy intentionally exposes only the subset needed by the current local
legend model. The following Vega/Vega-Lite properties are not surfaced yet.
Some may be useful later, but they are not all required for the initial
GenomeSpy legend milestone.

Potentially useful compatibility candidates:

- explicit legend `values`, `tickCount`, and `tickMinStep` for controlling
  shown entries/ticks,
- explicit legend `type` if users need to force symbol vs gradient behavior,
- gradient sizing/styling knobs: `gradientLength`, `gradientThickness`,
  `gradientOpacity`, `gradientStrokeColor`, and `gradientStrokeWidth`,
- gradient label overlap controls: `labelOverlap` and `labelSeparation`,
- symbol styling overrides beyond current base fill/stroke/stroke width:
  `symbolFillColor`, `symbolStrokeColor`, `symbolOpacity`, `symbolDash`,
  `symbolDashOffset`, and `symbolLimit`.

Lower-priority or architecture-dependent Vega surface:

- group placement/styling knobs: `cornerRadius`, `legendX`, `legendY`,
  `fillColor`, and `strokeColor` as Vega-style aliases,
- title styling details: `titleAlign`, `titleAnchor`, `titleBaseline`,
  `titleLineHeight`, and `titleOpacity`,
- custom legend encoders (`legend.encoding` / Vega `encode`),
- accessibility and interaction properties such as `aria`, `description`,
  `zindex`, interactive legend filtering, and unselected legend opacity.

Do not add these wholesale. Add a property only when a concrete example or
user-facing need appears, and prefer GenomeSpy's existing config names unless
Vega compatibility requires a public alias.

### Channel Coverage

Active channels:

- `color`
- `fill`
- `stroke`
- `shape`
- `size`
- `opacity`
- `fillOpacity`
- `strokeOpacity`

Opacity-like legends use symbol entries. Quantitative opacity legends use
representative tick values, matching `size` legend behavior, rather than
gradient ramps. Vega-Lite supports legends for `opacity` but not
`fillOpacity` or `strokeOpacity`; GenomeSpy supports all three because its mark
encoders expose separate fill and stroke opacity channels.

Unsupported scale-backed non-position channels:

- `strokeWidth`
- `angle`
- `dx`
- `dy`

These do not currently have a clear legend representation.

### Scale Coverage

Supported:

- discrete nominal/ordinal symbol legends,
- quantitative `linear`, `log`, `pow`, `sqrt`, `symlog`, `threshold`, and
  `quantize` gradient legends,
- quantitative `size` symbol legends.

Unsupported or deferred:

- `quantile`, which GenomeSpy does not currently support,
- `time` and `utc`, which GenomeSpy does not currently support,
- binned legends unless scale metadata exposes bin boundaries cleanly,
- interactive legend filtering,
- shared legends for intentionally shared scales,
- root-level or named-area legend placement.

### Robustness And Tests

Use small, behavior-focused tests. Avoid tests that duplicate generated spec
internals unless that exact structure is an intentional contract.

Useful next checks:

- one compact supported-matrix test group for active channel/type combinations,
- layout snapshots for stable side/corner examples if the structures are
  suitable.

For layout-level tests, prefer existing hierarchy/layout helpers such as
`specToLayout(...)` or `renderToLayout(...)`.

Suggested focused commands:

```bash
npx vitest run packages/core/src/view/gridView/gridViewLegend.test.js
npx vitest run packages/core/layout.test.js packages/core/examples.test.js --testNamePattern 'examples/core/legends'
npm --workspaces run test:tsc --if-present
```

### Examples

Keep `examples/core/legends/` small and test-like. Add examples only when they
serve as useful manual testbeds for behavior that is hard to understand from a
unit test.

Current example roles:

- gradient scale behavior: linear, log, threshold, quantize,
- redundant discrete encodings: color plus shape,
- rect swatches with aggregate/stack: horizontal stacked bar,
- size legends: bubble health/income,
- local layered placement: inside and outside regions.

## Shared And Complex Placement

The current model intentionally does not append every legend to a shared root
container. For now, a root `vconcat` with multiple unit children should keep
local child legends unless the spec later gains an explicit way to request a
container-level guide host. Do not infer collected placement merely because
multiple children happen to have legends.

Later versions can add:

- merged legends for intentionally shared non-position scales,
- a computed common guide host for shared legends,
- named guide areas,
- explicit guide-area views,
- app-level legend panels.

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

This is not required for the current local-legend milestone.

## Completed Refactors

- Simplified legend resolution member shape.
- Moved legend definition creation into `LegendResolution`.
- Extracted `GridChild` legend construction and per-orient bookkeeping into
  `gridChildLegends.js`.
- Extracted local legend placement and rendering into `legendLayout.js`.
- Organized `gridViewLegend.test.js` into behavior-focused `describe` blocks
  without splitting it into more files.
- Pruned exhaustive generated-mark assertions to representative checks.
- Added a shared `resolveInitOnlyExprRef` helper for structural ExprRef
  properties that can be evaluated once but must fail on later changes.
