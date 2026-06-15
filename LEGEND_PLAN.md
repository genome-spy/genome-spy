# Legend Plan

This document captures the current design notes for adding simple legends to
GenomeSpy Core. The first implementation should focus on Vega-style local
legends for simple plots. More flexible app-level placement, such as named guide
areas, can be added after the core guide machinery exists.

## First-Version Acceptance Criterion

The first version is accepted when `examples/core/marks/point/point2d.json`
renders a discrete color legend on the right side of the plot area after legends
are enabled for the example or test context, matching the basic Vega-Lite
behavior for that example.

Legends must be disabled by default through config, so existing GenomeSpy
visualizations do not change unless a spec or embedding context opts in.

The implementation does not need to match Vega internally. However, the
configuration and behavior of a single simple legend should largely match
Vega/Vega-Lite. The local checkouts in `tmp/vega/` and `tmp/vega-lite/` should
be used as references for defaults, generated legend structure, and single
legend behavior.

When architecture, docs, defaults, or implementation details are copied or
closely adapted from the Vega projects, add a nearby code or documentation
comment noting that they are adapted from Vega:
[`vega/vega`](https://github.com/vega/vega/).

## Initial Point2D Milestone Implementation Plan

This milestone only needs to make `examples/core/marks/point/point2d.json` show
a Vega-Lite-like symbol legend for the nominal `Origin` color channel on the
right side of the plot area when legends are enabled through config or an
explicit channel legend definition.

### Task 1: Add Legend Spec Types

Files:

- Modify `packages/core/src/spec/channel.d.ts`.
- Create or modify `packages/core/src/spec/legend.d.ts`.
- Modify `packages/core/src/spec/config.d.ts`.
- Regenerate schema artifacts if the schema build requires it.

Steps:

1. Add a minimal `Legend` type for symbol legends:
   - `title?: string | null`
   - `orient?: "left" | "right" | "top" | "bottom"`
   - `direction?: "vertical" | "horizontal"`
   - `columns?: number`
   - `labelLimit?: number`
   - `symbolSize?: number`
   - `symbolType?: string`
2. Add a `LegendConfig` type for config-level defaults. Include the first
   properties needed by the point2d milestone:
   - `disable?: boolean`
   - `orient?: "left" | "right" | "top" | "bottom"`
   - `direction?: "vertical" | "horizontal"`
   - `padding?: number`
   - `rowPadding?: number`
   - `columnPadding?: number`
   - `labelAlign?: Align`
   - `labelBaseline?: Baseline`
   - `labelColor?: string`
   - `labelFont?: string`
   - `labelFontSize?: number`
   - `labelFontStyle?: FontStyle`
   - `labelFontWeight?: FontWeight`
   - `labelLimit?: number`
   - `labelOffset?: number`
   - `symbolSize?: number`
   - `symbolType?: string`
   - `symbolOffset?: number`
   - `symbolStrokeWidth?: number`
   - `symbolBaseFillColor?: string`
   - `symbolBaseStrokeColor?: string`
   - `titleColor?: string`
   - `titleFont?: string`
   - `titleFontSize?: number`
   - `titleFontStyle?: FontStyle`
   - `titleFontWeight?: FontWeight`
   - `titleLimit?: number`
   - `titleOrient?: "top" | "bottom" | "left" | "right"`
   - `titlePadding?: number`
3. Add `legend?: LegendConfig` to `GenomeSpyConfig`.
4. Replace the current `LegendMixins = Record<string, never>` placeholder with
   `legend?: Legend | null`.
5. Keep JSDoc user-facing and concise. Use the local Vega/Vega-Lite docs and
   typings as references for property names and defaults.
6. Run the focused schema/type check that is normally used after spec type
   changes:

   ```bash
   npm --workspaces run test:tsc --if-present
   ```

Tentative commit message:

```text
feat(core): add initial legend spec types
```

### Task 2: Add Legend Config Defaults

Files:

- Create `packages/core/src/config/defaults/legendDefaults.js`.
- Create `packages/core/src/config/legendConfig.js`.
- Create `packages/core/src/config/legendConfig.test.js`.
- Modify `packages/core/src/config/defaultConfig.js`.
- Optionally modify `packages/core/src/config/themes.js` only if a built-in
  theme needs legend-specific overrides.

Steps:

1. Copy the relevant simple symbol-legend defaults from
   `tmp/vega/packages/vega-parser/src/config.js`:
   - `orient: "right"`
   - `padding: 0`
   - `gridAlign: "each"`
   - `columnPadding: 10`
   - `rowPadding: 2`
   - `symbolDirection: "vertical"` or a GenomeSpy `direction: "vertical"`
     equivalent
   - `labelAlign: "left"`
   - `labelBaseline: "middle"`
   - `labelLimit: 160`
   - `labelOffset: 4`
   - `symbolLimit: 30`
   - `symbolType: "circle"`
   - `symbolSize: 100`
   - `symbolOffset: 0`
   - `symbolStrokeWidth: 1.5`
   - `symbolBaseFillColor: "transparent"`
   - `symbolBaseStrokeColor` matching GenomeSpy's neutral gray
   - `titleLimit: 180`
   - `titleOrient: "top"`
   - `titlePadding: 5`
2. Add a comment near the copied defaults stating that the legend defaults are
   adapted from Vega: `https://github.com/vega/vega/`.
3. Add `disable: true` to GenomeSpy's internal legend defaults. This is a
   deliberate compatibility difference from Vega/Vega-Lite.
4. Wire `legend: LEGEND_DEFAULTS` into `INTERNAL_DEFAULT_CONFIG`.
5. Add `getConfiguredLegendDefaults(scopes, options)` following the same merge
   style as `getConfiguredAxisDefaults(...)`. For the initial milestone, merge
   `scope.legend`, any style referenced by `legend.style`, and explicit legend
   style if the spec type supports it.
6. Add tests verifying:
   - internal defaults include `disable: true`,
   - closer config scopes override earlier scopes,
   - explicit legend properties override config defaults,
   - copied Vega defaults are present for the first supported properties.
7. Run:

   ```bash
   npx vitest run packages/core/src/config/legendConfig.test.js
   ```

Tentative commit message:

```text
feat(core): add legend config defaults
```

### Task 3: Add Internal `packLabels` Transform

Files:

- Create `packages/core/src/data/transforms/packLabels.js`.
- Create `packages/core/src/data/transforms/packLabels.test.js`.
- Modify `packages/core/src/data/transforms/transformFactory.js`.
- Modify `packages/core/src/spec/transform.d.ts`.

Steps:

1. Write tests for vertical packing:
   - input rows have `label`, `_labelWidth`, and `_legendIndex`.
   - output rows get `_legendEntryX`, `_legendEntryY`,
     `_legendEntryWidth`, `_legendEntryHeight`, `_legendLabelX`, and
     `_legendLabelY`.
   - entry width is based on symbol extent, label offset, and measured label
     width.
2. Write tests for horizontal packing with varying label widths:
   - one-row layout when `direction: "horizontal"` and no explicit columns.
   - column offsets use previous column widths plus `columnPadding`.
3. Implement `PackLabelsTransform` as a modifying transform, following the
   style of `MeasureTextTransform`.
4. Register the transform in `transformFactory.js` as `packLabels`.
5. Add internal transform params to `transform.d.ts`. Keep docs terse and mark
   the transform as intended for generated guide specs.
6. Run:

   ```bash
   npx vitest run packages/core/src/data/transforms/packLabels.test.js
   ```

Tentative commit message:

```text
feat(core): add internal legend label packing transform
```

### Task 4: Build Legend Entry Data From Scale Resolution

Files:

- Create `packages/core/src/view/legend/legendEntries.js`.
- Create `packages/core/src/view/legend/legendEntries.test.js`.
- Reference `tmp/vega/packages/vega-parser/src/parsers/legend.js`,
  `tmp/vega/packages/vega-parser/src/parsers/guides/legend-symbol-groups.js`,
  and `tmp/vega-lite/src/compile/legend/properties.ts`.

Steps:

1. Add a small helper that accepts a scale resolution and legend/channel context
   and returns deterministic entry rows for a discrete scale.
2. For the `point2d.json` path, produce one row per `Origin` domain value with:
   - `value`
   - `label`
   - `_legendIndex`
3. Keep ordering consistent with the resolved scale domain.
4. Use the scale for symbol color in the generated legend mark rather than
   baking colors into the data.
5. Write tests with a small fake scale/resolution to verify labels and order.
6. Run:

   ```bash
   npx vitest run packages/core/src/view/legend/legendEntries.test.js
   ```

Tentative commit message:

```text
feat(core): derive discrete legend entries from scales
```

### Task 5: Add `LegendView` For Local Symbol Legends

Files:

- Create `packages/core/src/view/legendView.js`.
- Create `packages/core/src/view/legendView.test.js`.
- Modify files that collect or create view chrome if needed.
- Use `packages/core/src/view/axisView.js` as the main pattern.

Steps:

1. Implement `LegendView` as an internal generated view, similar in spirit to
   `AxisView`.
2. Generate a layer spec containing:
   - a symbol layer using `point` for the legend symbol,
   - a text layer using `text` for labels,
   - `measureText`,
   - `packLabels`.
3. Resolve legend properties by merging config defaults and explicit legend
   properties. Explicit channel-level legend properties win.
4. For the first version, default through config to:
   - `orient: "right"`
   - `direction: "vertical"`
   - title from `legend.title` or field title
5. Mark legend views as chrome and non-addressable.
6. Observe the label collector after data is ready, mirroring the `AxisView`
   auto-extent pattern.
7. Grow the legend extent when measured labels require more space, then request
   layout reflow.
8. Run:

   ```bash
   npx vitest run packages/core/src/view/legendView.test.js
   ```

Tentative commit message:

```text
feat(core): render local symbol legends from generated marks
```

### Task 6: Place Right-Oriented Legend Beside Simple Plots

Files:

- Modify `packages/core/src/view/gridView/gridView.js`.
- Modify related layout tests under `packages/core/src/view/`.
- Use axis layout code in `gridView.js` as the placement reference.

Steps:

1. Add a local legend decoration slot for the right side of a simple plot.
2. Make the implicit root wrapper reserve space for the right legend, so
   enabled `point2d.json` keeps the plot area and renders the legend outside
   the marks.
3. Keep the first version narrow:
   - support right-oriented local legends,
   - do not merge legends across siblings,
   - do not add named guide areas.
4. Add a layout test using `examples/core/marks/point/point2d.json` with
   `config.legend.disable: false`, or a compact equivalent spec. Assert that:
   - the content plot area remains 200 by 200,
   - a legend view exists,
   - the legend is positioned to the right of the plot area.
5. Run a focused layout test:

   ```bash
   npx vitest run packages/core/src/view/layoutSnapshot.test.js packages/core/src/view/legendView.test.js
   ```

Tentative commit message:

```text
feat(core): place right-oriented legends beside plots
```

### Task 7: Wire Default Legend Creation For `point2d.json`

Files:

- Modify the scale/encoding resolution path that can discover legend-bearing
  channel definitions.
- Modify or add focused tests near the changed code.
- Use `packages/core/src/spec/channel.d.ts` and
  `examples/core/marks/point/point2d.json` as the first behavior target.

Steps:

1. Detect non-position channel definitions with scales and default legends.
2. For the first version, enable legend generation for nominal or ordinal
   `color` only when `config.legend.disable` is `false` or the channel has an
   explicit non-null legend definition.
3. Respect `legend: null`, which suppresses the legend even when config enables
   legends.
4. Use Vega/Vega-Lite defaults from `config.legend` for `point2d.json` where
   practical:
   - `orient: "right"`
   - vertical symbol entries
   - title derived from the field name, `Origin`
5. Add tests that verify:
   - default config does not produce a legend,
   - `point2d.json` produces a legend when the test config sets
     `legend.disable: false`,
   - an explicit channel legend produces a legend even when config disable is
     true,
   - `legend: null` suppresses it,
   - quantitative `x` and `y` do not produce legends.
6. Run:

   ```bash
   npx vitest run packages/core/src/view/legendView.test.js
   ```

Tentative commit message:

```text
feat(core): create default color legends for discrete fields
```

### Task 8: Verify Against Vega-Lite Behavior

Files:

- Modify or add a rendered layout/smoke test for
  `examples/core/marks/point/point2d.json`.
- Optionally add a short docs note only if user-facing legend spec docs are
  generated in the previous tasks.

Steps:

1. Run the focused example test or add one if no suitable test exists.
2. Start the dev server if visual verification is needed:

   ```bash
   npm start
   ```

3. Open the example route for `examples/core/marks/point/point2d.json` with a
   config override that sets `legend.disable: false`, or temporarily add that
   override while verifying and remove it before committing.
4. Compare the result with Vega-Lite behavior:
   - legend appears to the right of the plot,
   - title is `Origin`,
   - entries correspond to the discrete `Origin` values,
   - symbols use the same color scale as the point marks.
5. Run broader checks:

   ```bash
   npm --workspaces run test:tsc --if-present
   npx vitest run packages/core/src/data/transforms/packLabels.test.js packages/core/src/view/legendView.test.js
   ```

Tentative commit message:

```text
test(core): cover point legend milestone
```

### Task 9: Final Cleanup For The Milestone

Files:

- Modify files touched by the milestone only.
- Update `LEGEND_PLAN.md` if implementation decisions differ from this plan.

Steps:

1. Inspect the full diff:

   ```bash
   git diff
   ```

2. Remove temporary compatibility paths, debug logging, and speculative code
   that is not needed for `point2d.json`.
3. Run the final focused checks:

   ```bash
   npx vitest run packages/core/src/data/transforms/packLabels.test.js packages/core/src/view/legendView.test.js
   npm --workspaces run test:tsc --if-present
   ```

4. If the final diff spans several meaningful areas, amend the earlier commits
   only if it keeps the history clearer. Otherwise add a cleanup commit.

Tentative commit message:

```text
chore(core): clean up initial legend milestone
```

## Vega and Vega-Lite Findings

Vega-Lite is mostly a legend authoring layer. It decides whether a guide exists,
chooses symbol or gradient legend type, applies defaults, merges compatible
legends, and emits Vega legend definitions. The final mark generation and layout
are handled by Vega.

Vega builds legends from ordinary scenegraph marks:

- A legend group contains a legend-entry group and optional title.
- A symbol legend facets legend values into one group per entry.
- Each entry group contains a symbol mark and a text mark.
- Symbol encodings are scale-backed for channels such as `fill`, `stroke`,
  `shape`, `size`, `opacity`, and related stroke properties.
- Label text is read from the legend entry datum.

For horizontal symbol legends, Vega does not precompute text widths during
parsing. It generates entry groups, lets the scenegraph compute bounds, and then
uses a grid layout pass to place the entry groups. The grid layout computes
per-column widths and per-row heights from measured child bounds. With the
default `gridAlign: "each"`, the next column starts after the widest entry in
the previous column, so varying label lengths are handled naturally.

Vertical symbol legends are simpler: entries can be stacked, and the overall
legend width is the maximum entry width.

## Rationale

GenomeSpy should not start with a global root-level legend panel. GenomeSpy view
hierarchies can be complex, with hidden tracks, dynamically added tracks,
sample views, lifted summaries, and imported subtrees. A single root-level
legend area can easily detach a legend from the marks it explains.

Scale resolution ownership is also not a sufficient placement rule. In
GenomeSpy, shared scales are often pulled toward higher ancestors. For example,
`ContainerView` defaults resolutions to `shared`, `vconcat` shares `x` by
default, and `forced` resolutions can cross independent parents. This behavior
is correct for scale/domain sharing, but it means the scale resolution owner is
often more dataflow-oriented than visually meaningful.

Therefore, legend generation and legend placement should be treated separately:

- The scale resolution determines the scale, domain, and legend entries.
- A guide host determines where the legend is placed in the view hierarchy.

For the first version, guide hosting should stay local and conservative.

## Initial Implementation Notes

The first milestone implementation creates local symbol legends for simple unit
views when either `config.legend.disable` is `false` or the channel has an
explicit non-null `legend` object. The generated legend is attached to the
`GridChild` that hosts the unit view, and it is rendered as grid-owned chrome in
the configured external orientation.

Legend rows are produced by an internal lazy data source rather than by copying
the scale domain during view construction. This is necessary because guide views
are created before data loading has populated scale domains. The lazy source
listens to the explained view's scale resolution and publishes rows containing
`value`, `label`, and `_legendIndex`.

The first implementation reserves a fixed perpendicular legend extent of 80 px.
That is enough for the `point2d.json` milestone, but a later iteration should
measure the generated label layer and request layout reflow when labels require
more space.

The current automatic legend creation is intentionally narrow:

- unit views only,
- nominal and ordinal channels only,
- local legends only,
- no legend merging across siblings,
- no global or named guide areas,
- no gradient legends.

## Initial Scope

The first implementation should support simple local symbol legends:

- Discrete symbol legends for non-position channels.
- Start with `color`, `fill`, `stroke`, and possibly `shape`.
- Local placement using a Vega-like `orient` property.
- Default `orient: "right"`.
- A right-oriented legend is placed to the right of the plot area, not over the
  marks.
- Legend defaults come from the GenomeSpy config machinery.
- Internal default config sets `config.legend.disable` to `true`.
- A legend is shown only when config enables legends or the channel has an
  explicit non-null legend definition.
- Vertical layout first.
- Horizontal layout second, using measured label widths.
- `legend: null` disables the legend.
- Hidden views do not render legends.
- No gradient legends.
- No named guide areas.
- No interactive legend filtering.

Example:

```json
{
  "mark": "point",
  "encoding": {
    "color": {
      "field": "sampleTime",
      "type": "ordinal",
      "legend": {
        "title": "Sample time",
        "orient": "right"
      }
    }
  }
}
```

The first implementation fixture should be
`examples/core/marks/point/point2d.json`. It is a compact scatterplot with a
nominal `color` encoding for `Origin`, so it exercises the most urgent path:
a simple point mark with a discrete color legend.

## Generated Legend Structure

Legends should follow the existing `AxisView` pattern: generate a regular
GenomeSpy spec from guide configuration, render it using normal marks, and use
view-level code only for measurement, sizing, and layout integration.

A symbol legend can be generated from normal marks:

- `point` or `rect` for the symbol.
- `text` for the label.
- Optional transparent `rect` for future hit regions.

The generated data should contain at least:

- Legend value.
- Formatted label.
- Entry index.
- Scale-backed symbol properties.
- Measured label width.
- Packed entry and label position fields.

## Horizontal Packing

GenomeSpy does not have Vega's scenegraph bounds layout pass. Instead, horizontal
packing can be implemented with internal data transforms:

1. `measureText` computes label widths.
2. An internal `packLabels` transform computes entry placement fields.
3. The generated point, rect, and text marks use those fields.

Potential `packLabels` output fields:

```js
{
    _legendRow,
    _legendColumn,
    _legendEntryX,
    _legendEntryY,
    _legendEntryWidth,
    _legendEntryHeight,
    _legendLabelX,
    _legendLabelY
}
```

The transform should not need to compute symbol positions. The symbol mark can
be positioned from the entry origin with fixed offsets, and the text mark can be
positioned with an `xOffset` from the symbol. This keeps `packLabels` focused on
the part that depends on measured text: entry dimensions and label placement.

The basic packing algorithm:

1. Compute each entry's natural width from symbol extent, label offset, and
   measured label width.
2. Compute each entry's height from symbol extent and label height.
3. Assign row and column.
4. Compute maximum width per column and maximum height per row.
5. Prefix-sum column widths and row heights with padding.
6. Write final entry and label positions.

For horizontal legends without explicit columns, use one row. For vertical
legends with explicit columns, consider matching Vega and filling columns first.

Auto-wrapping by available width should be postponed. It introduces a layout
feedback loop because the available legend width depends on layout and the
legend layout depends on available width.

## Placement Model

The first implementation should not append every legend to a shared root
container. A practical first model is:

- A legend is requested by a channel definition.
- The legend is generated from the corresponding scale resolution.
- The legend is hosted near the local visual context that requested it.
- For simple unit or layer plots, `orient` places the legend around that plot.
- The implementation should leave room for shared legends later, but should not
  attempt full cross-subtree guide routing in the first version.

This is intentionally narrower than the eventual model. Later versions can add:

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

This should not be required for the initial simple-legend implementation.

## Testing Notes

Focused tests should cover:

- Default config keeps legends hidden.
- The initial fixture `examples/core/marks/point/point2d.json` renders a
  discrete color legend for `Origin` to the right of the plot area when
  `config.legend.disable` is `false`.
- Legend spec generation for a simple discrete color legend.
- `legend: null` disables generation.
- Legend defaults are resolved through `config.legend`.
- Vertical legend size derives from measured labels.
- Horizontal packing handles labels with varying widths.
- Hidden views do not contribute legends.
- Layout reflow occurs when measured legend extent grows.

For layout-level tests, prefer the existing hierarchy/layout test utilities such
as `specToLayout(...)` or `renderToLayout(...)`.
