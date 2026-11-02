# Grouping gaps for categorical positional scales

Status: implementation complete. Updated on 2026-11-02 against `master` at
`be31682a6` in the dedicated `codex/band-scale-gaps-sizing` worktree. Retain this
reconciled record on the feature branch; remove it in a later commit before merge.

## Motivation and scope

Categorical heat maps need visible separators between selected rows or columns
without replacing category values with manually maintained integer indices.
Index and locus scales already offer `gapPositions` and `gapWidth`, but enabling
them on a band scale currently fails validation. Uniform `paddingInner` cannot
express larger separators at selected group boundaries.

Extend positional `band` and `point` scales with fixed CSS-pixel grouping gaps.
Point is the zero-bandwidth variant of band and shares its gap implementation.
Keep equal cell bandwidths, category identities, explicit domain ordering, aligned axes,
shared annotation tracks, picking, and export consistent. Support gaps on both
heat-map axes, fixed/stretch dimensions, and step-based dimensions. Initially
reject automatically fitted categorical offset scales under a statically gapped
primary band. Supporting those across unequal placements requires a separate
renderer contract; ordinary heat-map cells do not need it.

Non-goals: categorical zoom/pan or interval brushing; grouping gaps on
`ordinal`, nonpositional, or offset scales; automatic clustering/group discovery; group
labels, dendrogram splitting, variable widths per cut, and new App sample-layout
behavior. Preserve index/locus mapping and navigation. Correct their step-sized
view extent to reserve gaps using the same accounting as their existing mapping.

## Current implementation and constraints

- `packages/core/src/genome/scaleIndex.js` and `indexGapMapping.js` implement
  normalized numeric cuts, fixed-pixel conversion using the occurrence extent,
  exhausted-placement hiding, and index-specific navigation/half-open endpoints.
  Do not import that entire mapping into a categorical scale.
- `packages/core/src/scales/scaleResolution.js` registers index/locus scales and
  restricts grouping gaps to primary positional channels.
  `scaleInstanceManager.js` further restricts scale types, binds expressions,
  normalizes cuts, and publishes completed mapping changes. Its current cache
  keyed only by the raw positions array is insufficient for category-valued cuts:
  the same array can resolve differently after a domain reorder.
- CPU band scales are supplied by Vega's
  `vega-scale/src/scales/scaleBand.js`, via `src/scale/scale.js`. They expose
  `invert`/`invertRange`, preserve positive `step` and `bandwidth`, and return the
  lower numeric edge of a band even for a reversed range. Padding and alignment
  follow Vega, including its padded-singleton denominator. They are not identical
  to either index scales or the current bare D3 band implementation.
- `scaleInstanceManager.js::domainProps` separates stable categorical IDs from
  dense active-domain ranks. WebGL and WebGPU already map retained IDs to current
  slots. Reordering must update mapping tables, never renumber encoded data.
- `src/rendering/immediate/markEncoding.js` assumes any `gapMapping` belongs to
  an index-like scale and coerces datum values to numbers. Generalize its forward
  projection, while explicitly guarding index-only inversion/navigation in
  `scalePosition.js` and interaction consumers. `bandstep` already consumes only
  forward step metadata and can share that capability.
- `src/view/view.js::getDimensionSize` currently calculates step-based size as
  `bandSpace(count, paddingInner, paddingOuter) * effectiveStep`. Its size-cache
  invalidation observes primary and eligible offset-domain changes only. Gap
  changes also affect desired dimensions. Nested offsets derive ranges from
  primary `bandwidth()` in `scalePropsResolver.js`; that resolution-wide value
  cannot fit unequal gapped occurrences.
- `src/view/axisView.js` installs `scaleGroups` for any statically enabled gaps,
  but `src/data/sources/lazy/scaleGroupsSource.js` accepts only numeric index/locus
  intervals. Merely loosening the band-scale validation would break axes.
- Rendering ownership follows `packages/core/docs/architecture/rendering.md`:
  Core owns scale semantics; backends own gap tables and GPU resources; immediate
  projection is shared by Canvas2D/SVG. WebGPU remains behind its public package
  API and cannot import Core grammar or depend on WebGL internals.

## Proposed public contract

Reuse the existing properties. For a band or point scale, `gapPositions` lists **domain
values before which a gap is inserted**, rather than numeric ranks:

```json
{
  "mark": "rect",
  "encoding": {
    "x": {
      "field": "gene",
      "type": "nominal",
      "scale": {
        "type": "band",
        "domain": ["TP53", "BRCA1", "EGFR", "KRAS"],
        "gapPositions": ["EGFR"],
        "gapWidth": 8
      }
    },
    "y": {
      "field": "sample",
      "type": "nominal",
      "scale": {
        "type": "band",
        "domain": ["S1", "S2", "S3", "S4"],
        "gapPositions": ["S3"]
      }
    },
    "color": { "field": "value", "type": "quantitative" }
  }
}
```

- Accept domain scalar values (`string | number | boolean`), or an expression
  returning such an array or null. Extend `Scale.gapPositions` accordingly.
  Numeric band values mean categories: with domain `[10, 20, 30]`, `[20]` cuts
  before category `20`, not slot 20. Index/locus arrays retain numeric-coordinate
  semantics and validation; `"chromosomes"` remains locus-only. A band category
  named chromosomes is written as `["chromosomes"]`.
- Resolve against the completed active domain, using the same category equality
  as domain lookup. Deduplicate and sort resolved cuts by rank. Ignore absent
  categories and the first category, so filtering or reorder cannot create an
  outer gap. Removing a boundary category removes its gap; reinserting it restores
  the gap. This API does not remember the membership of a disappearing group.
- Domain order determines which categories are consecutive; specifying cuts
  never reorders data. Reversing output preserves the logical cut between the
  same two neighboring categories.
- Retain the existing default width of 6 CSS pixels, nonnegative finite width
  validation, expression ownership, and static-disable semantics. Constant
  empty/null positions or zero/null width skip evaluation of the other expression
  and omit gap shader/resources. Reactive zero/empty values retain specialization.
- `paddingInner` still inserts proportional padding between every pair of bands;
  grouping gaps add pixels at selected boundaries. Cell bandwidth excludes both
  kinds of padding. `band` anchors always refer to the cell, never the following
  group gap. Explicit multi-category ranges may span a gap normally.
- Keep the ordinary band/point lookup/copy/padding/alignment/inversion behavior.
  Point inversion wholly within padding or a grouping gap returns `undefined`;
  `invertRange` returns only intersected categories in domain order.
- Point scales keep zero bandwidth, outer-padding semantics, and exact-position
  inversion; `band` anchors have no effect. Grouping gaps increase spacing
  between point centers. Large symbols may extend into that spacing under their
  ordinary geometry/picking rules; no symbol-size exclusion strip is promised.
- Initially reject `round: true` with statically enabled categorical gaps. GenomeSpy's
  normalized positional ranges and existing GPU formulas do not provide a sound
  cross-renderer rounding contract. Do not silently accept conflicting rounding
  and fixed CSS-pixel widths. Disabled-gap band scales retain existing rounding.

## Geometry and implementation decisions

### A small categorical mapping, with shared cut infrastructure

Add a shared Core band/point implementation, tentatively
`packages/core/src/scales/scaleBand.js`, integrated through `src/scale/scale.js`.
Prefer composition with the existing Vega band constructor for ordinary setter,
domain normalization, and disabled-gap behavior. Preserve each public scale type
and its discrete traits. Do not build a general discontinuous-scale framework or
refactor the index navigation machinery as a prerequisite.

The simplification revision uses ordinary native band positions as its source:
with rounding disabled, compressing a band range is an affine transform. Cache
the final category starts once per placement extent, then share that table
between forward lookup and inversion. Do not keep a second rank map or copy a
native scale for each placement. GPU band gaps similarly call their existing
band function on the compressed range before adding the gap offset.

Keep the three existing gap properties and their validation in one small shared
installer for index and categorical scales. A scale-owned `sizeForStep(step)`
computes preferred extent from the scale's own domain/padding/gap state; View
retains offset-step selection and layout invalidation. These are internal
capabilities, without a new grammar, geometry engine, or layout solver. Retained
WebGPU translation shares one gap-property attachment path for both scale kinds.

Extend existing `gapMapping(extent)` with a shared forward contract: `position`,
`step`, and `fits`. `position` accepts the scale's domain value and includes the
within-band anchor; band projection performs category lookup internally. Keep
index-only `invertPoint`, `navigate`, interpolation, and fractional camera ranks
on the index implementation. Guard those operations by scale kind, rather than
the presence of `gapMapping`. Do not add a parallel `bandGapMapping` API and
repeated dispatch in each renderer. Keep canonical domain/cut state on the scale
and reuse the existing placement-local geometry caching pattern by CSS extent.
Rendering uses the actual occurrence extent, including repeated/faceted and
export-sized placements, without mutating a shared scale for each draw. Ordinary
scale calls and metadata use the resolution's existing default extent contract.
That default is insufficient for automatically derived nested offset ranges,
which are excluded initially. Do not claim arbitrary `scale()`/`bandwidth()`
expressions become occurrence-local by updating renderer projection.

Use effective inner padding 1 for point scales; their native API omits
`paddingInner()`. Reuse the categorical geometry with that value and point's
outer padding. For a nonempty domain of `n` categories, `m` internal cuts, pixel extent
`E`, and normalized output span `R`:

```text
gap = gapWidth / E
available = abs(R) - m * gap
space = bandSpace(n, paddingInner, paddingOuter)  // Vega semantics
step = available / (space || 1)
bandwidth = step * (1 - paddingInner)
start = min(range) + (available - step * (n - paddingInner)) * align
```

For forward output, rank `i` starts at
`start + i * step + cutsAtOrBefore(i) * gap`. For reversed output it starts at
`start + (n - 1 - i) * step + (m - cutsAtOrBefore(i)) * gap`.
Within-band placement adds positive `bandwidth * band` in both cases. This keeps
Vega's alignment convention on the lower numeric side. `step()` remains the base
step excluding extra grouping gaps; distances across a cut are larger.

When `E <= 0` or gaps consume the available span, hide affected occurrences and
return no inverted categories, without infinities, negative cell widths, or stale
picking. Empty domains draw nothing; singleton domains have no effective cuts.
Recovery after resize or a gap update requires no data reload.

Reuse numeric cut normalization, rank lookup, static classification, fit checks,
and renderer-owned cut tables where their contracts match. Keep index fractional
edge ranks, continuous inversion, and half-open peer endpoint rules index-specific.
Use narrow capability types instead of casting a band scale to `ScaleIndex`.

### Publication and step-based view sizing

Resolve category values to dense numeric cuts from `DomainState.visibleDomain`
inside completed mapping publication. Recompute when either domain membership/
order or gap input changes, even if the gap input array has the same identity.
Publish immutable numeric cuts and width together with domain mapping; preserve
stable category IDs. Avoid per-row or per-frame sorting and allocations.

`width: {step: S}` and `height: {step: S}` describe the ordinary base step in CSS
pixels, excluding extra grouping gaps. At the preferred plot extent, keep that
step constant and grow the view by the displayed gap footprint. Padding still
changes cell bandwidth: `S * (1 - paddingInner)`. Axes, view padding, and structural
spacing remain outside this plot-size calculation.

For the canonical positional unit range, solve the same equation used by
forward mapping, without asking a placement-dependent mapping for its own size:

```text
E = S * D + gapWidth * M
```

`D` is the scale's data-space denominator; `M` is its displayed gap span:

| Scale                 | D                                                                      | M                                                             |
| --------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| Band                  | Vega `bandSpace(n, paddingInner, paddingOuter)`                        | Number of resolved internal cuts in the active ordered domain |
| Point                 | Vega `bandSpace(n, 1, padding)`                                        | Same resolved category cuts as band                           |
| Index/locus with gaps | `max(gapDomain ? EPSILON : 1, span - paddingInner + 2 * paddingOuter)` | `lastRank - firstRank` from the existing index mapping rules  |

For index/locus, use the current internal half-open displayed domain, not the
full data extent. If fractional `gapDomain` ranks exist, use them as the first
and last ranks. Otherwise compute `firstRank = gapRank(cuts, domain[0])` and
`lastRank = gapRank(cuts, domain[1], true)`. This excludes cuts outside the
displayed domain and includes fractional edge gaps during navigation. Do not
add one again to a domain already converted by `indexLikeDomainUtils.js`.
Reversal and alignment change placement, not desired size.

Representative preferred plot extents (all use `S = 20`, `gapWidth = 8`):

| Case                                                                    | E                                          |
| ----------------------------------------------------------------------- | ------------------------------------------ |
| Four unpadded band categories, one internal gap                         | `4 * 20 + 8 = 88 px`                       |
| Four unpadded point categories, one internal gap                        | `3 * 20 + 8 = 68 px`                       |
| Same, inner padding .2 and outer padding .1                             | `4 * 20 + 8 = 88 px`; cells are 16 px wide |
| Same, inner padding .2 and outer padding .3                             | `4.4 * 20 + 8 = 96 px`                     |
| Index internal domain `[10, 10.5]`, cut 10, ranks `[.5, 1]`, no padding | `.5 * 20 + .5 * 8 = 14 px`                 |

Empty band domains and uninitialized index `[0, 0]` without camera ranks keep
zero content size; handle them before counting cuts. A legitimate index camera
wholly inside a gap reserves only its fractional gap footprint plus genuine
padding. Do not turn a numerical `EPSILON` floor into a phantom full band or
require exact step recovery where there is no data span. Preserve finite layout
and existing no-mark behavior. Only constant-disabled settings use the existing
non-gapped sizing path. A reactive zero width or empty cut array retains the
gap-aware denominator, matching static shader/mapping specialization. Otherwise
a padded index singleton with inner padding .8 would jump between a 20 px
gap-aware extent and a 4 px legacy extent when a reactive gap is disabled.
Do not replace Vega's padded-singleton divisor with index's minimum divisor, or
rewrite unrelated constant-disabled/non-gapped index sizing in this feature.
Empty/singleton point domains retain native behavior: no cuts at a lone category,
zero bandwidth, and native alignment. Fix the existing step-sizing assumption
that all categorical scales expose `paddingInner()` by using point's effective 1.

This changes preferred content size, including implicit `config.view.step`.
For a fixed/stretch dimension, keep its size and shrink cells to reserve gaps.
For a scrollable view, calculate the full content size from its domain; the
fixed viewport does not change gap counting when scrolled. Step-based viewport
sizes remain unsupported. If a composition allocates a different plot extent,
map using that actual extent as today; the preferred size is not a new hard
constraint. Do not add another `rangeStep` grammar or a sizing solver.

Reuse `ScaleResolution.observeMapping()` for settled domain, fractional ranks,
cuts, width, and property updates. Defer this hookup to existing post-guide/
post-scale configuration (`configurePostScaleParams` after
`configureViewsAfterScaleResolution` initializes scales); keep construction-time
size-expression registration intact. `ViewFactory` calls `registerSizeInvalidation`
before guides/assemblies are configured, and `observeMapping` eagerly initializes
the scale, so subscribing there would be too early for inherited view-level
properties or URL-backed locus assemblies. Preserve existing subscription
disposal/idempotence, including dynamically added views, without a new lifecycle
or event family.

Retain old/new `SizeDef` comparison before `requestLayoutReflow()` and existing
ancestor cache invalidation. A cut moving with unchanged gap span must repaint
without reflow; width, gap span, domain, or padding updates reflow only when
preferred size changes. Range/extent notifications from layout must settle with
the same preferred size. Do not create a second sizing snapshot. On a step-sized
axis, gap width/cut expressions must be independent of that axis's allocated
extent, directly or indirectly. External parameter-driven gaps remain supported.
The existing parameter graph detects direct reads and ordinary derived aliases;
reject these using the existing ref dependencies. It cannot reliably detect a
cycle crossing imperative arrangement or delayed parameter updates. Such inputs
remain unsupported. No iterative layout solver or general dependency-validation
framework is part of this feature.

`step.for = "offset"` keeps its existing behavior on non-gapped primary scales.
For a hypothetical supported nested case, the algebra is
`primaryStep = offsetStep * offsetBandSpace / (1 - primaryPaddingInner)`, then
add the primary gap footprint once. That equation alone does not make a shared
offset scale occurrence-local: its current `bandwidth('x') * width` range is
wrong when gapped parents have different extents. Initially reject inferred
categorical offsets under a statically gapped primary band for either step target
(and the default offset target). Numeric pixel offsets retain existing semantics.
Do not use this feature to introduce dependent renderer scale composition.

Share `bandstep(channel, extent)` through the forward mapping contract. Retain
its signed base-step meaning and required extent for gapped scales; it cannot
represent category-specific displacement across a cut.

Categorical dendrograms retain their existing dense-rank midpoint semantics:
leaves align with cells and shared-node endpoints join, but internal branches
are not necessarily centered between children in pixel space across gaps.
Their category anchors plus fractional base-step offsets cannot express that
stronger contract. Physical recentering would require hierarchy-aware projected
layout and is outside this feature.

### Axes and scale groups

Extend `scaleGroups` deliberately to band/point scales so the existing automatic
segmented-axis behavior remains available. Preserve all numeric half-open
index/locus fields and semantics. For band axes, each row represents a contiguous
category group; `Start` and `End` contain the categories at the lower and higher
numeric projected edges, respectively. Render with `band: 0` and `band: 1`.
Swap endpoint categories when the scale range reverses; `Group` numbering stays
in logical domain order. A singleton group has identical endpoint categories.
These categorical endpoints are inclusive cell identifiers, not half-open indices.
For point scales, endpoints are first/last point centers and a singleton group
has a zero-length segment; do not invent cell extents around points.

Update `ScaleGroupsData` JSDoc, source validation/publication, axis encodings, and
lazy-source docs together. Depend on active domain, effective cuts, and range
direction; keep guides domain-inert. Test mixed band/index axes and the Cartesian
product. Ordinary ticks, labels, and grid lines use category encodings. Update
`axisLabelLayout.js` both to use the actual axis occurrence's extent and
`gapMapping(extent)` for CPU positions, and to invalidate on reactive gap
changes. Using `resolution.getAxisLength()` (the smallest shared member) and
resolution-default `scale(value)` would check different label positions from
those rendered in a larger occurrence. Overlap/flush decisions must update even
when domain and view dimensions stay unchanged. Verify axes for both small and
large shared members, including aligned annotation axes.

### Backend responsibilities

- **WebGL:** apply band gaps after stable-ID-to-dense-slot lookup in
  `gl/glslScaleGenerator.js`. Reuse `rendererResources.js` cut textures, with
  appropriate capability types. Update `marks/webGlMark.js` gap domain uniforms
  and fit checks for `[0, n]`. Preserve categorical reversal and within-band
  placement in a separate formula; never treat IDs or domain category values as
  index coordinates. Normal and picking passes must use identical geometry.
- **Canvas2D/SVG:** add categorical placement-local projection to
  `immediate/markEncoding.js` and exhausted-occurrence handling in `markData.js`.
  Preserve conditional encodings, datum/expression positions, secondary band
  endpoints, supported pixel offsets, and export-size behavior. Do not coerce categories
  with `Number()` or use index peer endpoint corrections.
- **WebGPU:** extend the renderer-generic public band scale API with numeric dense
  cuts/width and live updates. Update Core's `webGpuMarkAdapter.js` band config
  and `webGpuSurface.js::compileChannelBindings`. In the renderer, audit
  `defs/band.js`, `scales/indexGaps.js`, `programs/internal/scaleResources.js`, and
  shader assembly gates. Derive gap geometry from `[0, normalizedDomain.length]`,
  not sparse categorical IDs; update the domain map and cut geometry together.
  Share table/fit infrastructure without imposing index `gapDomain` navigation
  state. Keep renderer examples generic and typed-array based.

### KISS/DRY boundary and production size

Share the existing numeric cut normalization, `gapRank`, static enablement,
completed mapping publication, cut tables/uploads, and forward projection/fit
consumers. Category-to-rank resolution is a thin band-specific boundary. Keep
the denominator floors, reversed within-band anchors, and inversion/navigation
semantics explicit in their scale implementations; similar arithmetic does not
justify making them one scale model.

Keep the additive preferred-size calculation in `View` and reuse index rank
accounting. Extract a tiny pure helper only when its call sites remove repeated
logic overall; a few local arithmetic lines are preferable to strategy objects,
base classes, option matrices, or separate band/index sizing services. Do not
copy `indexGapMapping.js` and its navigation code into a band variant. Do not
copy Vega's entire band implementation merely to add gap offsets if composition
preserves its contract with less code.

Before implementing, measure the touched production areas. At `be31682a6`,
`scaleIndex.js` is 281 lines, `indexGapMapping.js` 228, `scalePosition.js` 44,
WebGL `gl/indexGaps.js` 53, and `view.js` 1,894 (`wc -l`, including comments).
Compare their diff plus any new shared/band modules after implementation.
Feature code may grow, but an abstraction must earn its cost through removed
duplication or a concrete correctness benefit; moving lines is not a reduction.

## Established designs and alternatives

- [D3 band scales](https://d3js.org/d3-scale/band) establish categorical band
  lookup, within-band anchors, and uniform padding. Preserve those concepts;
  selected fixed-pixel separators are an additional GenomeSpy capability.
- [D3 point scales](https://d3js.org/d3-scale/point) are zero-bandwidth bands.
  Vega's CPU factory and both GPU paths already share their band geometry.
  Keep point as a thin variant with the same category cuts, not another gap engine.
- [Vega band scales](https://vega.github.io/vega/docs/scales/#band-scales) distinguish
  fixed extent and fixed step. Follow the installed Vega implementation's exact
  geometry/inversion behavior rather than assuming all D3 formulas match.
- [Vega-Lite step-based sizing](https://vega.github.io/vega-lite/docs/size.html#step)
  preserves per-step sizing, including the choice of positional or offset steps.
  Keep GenomeSpy's existing view-size contract and add only the gap footprint.
- [ComplexHeatmap slice gaps](https://jokergoo.github.io/ComplexHeatmap-reference/book/a-single-heatmap.html#gaps-between-slices)
  demonstrate independent physical row/column separators. Borrow the visual
  convention, without adding clustering/slice ownership to a scale.
- Rank-valued cuts would reuse `number[]` with less type work, but drift when
  ordered categories change and make numeric categories ambiguous to authors.
  Category values align with before-coordinate index cuts and fit annotated
  heat maps better. Explicit index scales remain available for rank-based data.
- Dummy categories reserve cell-proportional space and contaminate domains/axes.
  Faceting is suitable for independent panels, but adds layout structure and
  independent scale concerns to a shared matrix. Neither replaces scale gaps.
- A CPU-only prototype would leave WebGL heat maps and picking inconsistent.
  Treat renderer parity as a delivery requirement, including experimental WebGPU.

No external code is copied by this plan. If implementation closely adapts Vega's
band code, retain its BSD-3-Clause copyright/notice and add a durable source link
with `Adapted from ...`; its license is compatible with this MIT repository.
D3 code adaptation requires its ISC notice. Do not copy ComplexHeatmap code.

## User documentation approach

Extend the existing grammar pages when the feature is implemented. Explain the
heat-map use case and author-visible behavior; keep renderer/resource details
and the internal sizing derivation in this plan.

- **`docs/grammar/scale.md`, Grouping gaps:** start with the shared purpose of
  separating selected rows/columns and the distinction between fixed CSS-pixel
  `gapWidth` and proportional `paddingInner`. Give band/point scales and index/locus
  scales separate subsections. Keep chromosome cuts, half-open numeric endpoints,
  navigation, and interval brushing under index/locus so they are not implied
  to apply to bands. Preserve shared-scale configuration guidance.
- **One categorical example:** add
  `examples/docs/grammar/scale/band-grouping-gaps.json` and embed it with `EXAMPLE`
  in the band subsection. Use a small heat map with named categories, explicit
  ordering, and independent cuts on both axes. Show gaps before domain values,
  including that numeric categories are values rather than ranks. Explain that
  removing a boundary category removes its gap under the proposed contract.
  Keep the existing numeric grouping-gap example in the index/locus subsection.
- **`docs/grammar/composition/concat.md`, Step sizing:** distinguish the requested
  base step, cell bandwidth after padding, and added grouping-gap pixels. Explain
  that fixed dimensions shrink cells while step-sized dimensions grow the plot.
  Give the unpadded four-category example: `width: {step: 20}` plus one 8 px gap
  produces an 88 px plot width, excluding guides and view padding. Cross-link
  the scale example; retain `SCHEMA Step` rather than repeat its property table.
  Clarify that scrolling uses the full content size and a separately sized viewport.
- **Authoritative property reference:** update `Scale.gapPositions` and
  `Scale.gapWidth` in `packages/core/src/spec/scale.d.ts`, `Step` in `view.d.ts`,
  and `ScaleGroupsData` in `data.d.ts`. Put defaults and exact input/endpoint
  semantics in JSDoc, then regenerate affected schema/doc types. Update
  `docs/grammar/data/lazy.md` for categorical `scaleGroups` endpoints without
  changing numeric half-open semantics. Avoid duplicating generated reference
  tables in prose.
- **Constraints:** document the actual shipped restrictions concisely in the
  relevant reference and link from feature prose: automatically fitted categorical
  offsets, `round: true`, and same-axis size-dependent gap expressions. Settle
  open contracts before publishing their wording. Treat renderer parity as normal
  behavior; describe a backend difference only if it affects correct usage.

Draft wording for the band-scale subsection, subject to the final contract:

> Grouping gaps separate selected groups of heat-map rows or columns. On a band
> scale, `gapPositions` lists categories before which gaps appear. For example,
> `gapPositions: ["C"]` inserts a gap between B and C in the domain
> `["A", "B", "C", "D"]`.
>
> `gapWidth` specifies extra spacing in CSS pixels. `paddingInner` continues to
> control proportional spacing between every pair of cells. Filtering out a
> boundary category removes its gap.

Verify the live example and affected generated references with the lightest
applicable documentation checks. Read the complete rewritten grouping-gap and
step-sizing sections for consistent scope and transitions.

## Implementation milestones and review gates

### 1. Internal categorical scale geometry

- [x] Implement the shared internal band/point mapping, category-to-cut normalization, scale
      composition, copy/inversion behavior, and disabled fast path. Keep public
      band-gap validation and specification types unchanged until milestone 2;
      ordinary consumers must never observe enabled gaps before they support them.
- [x] Verify direct scale behavior for string, numeric, and boolean categories;
      padded singleton/empty domains; reverse/align; reordered cuts; gap inversion;
      exhaustion and recovery. Retain existing headless categorical/index-gap
      regressions. Prefer representative contracts over setter-shape assertions.
- [x] Verify point zero bandwidth, outer padding, reversal, singleton placement,
      exact-position inversion, and copy through the same implementation.
- [x] Document internal capability semantics; no changeset is needed for this
      preparatory milestone without observable behavior changes.
- Commit: `4a531ddf0` — `refactor(core): prepare categorical grouping gap geometry`
- **Review gate:** proposed public API, categorical identity, geometry, and the
  rounding boundary before downstream consumers are finalized.

### 2. Heat-map rendering, guides, and sizing across backends

- [x] Integrate WebGL, immediate/SVG, and generic WebGPU band mapping/resources;
      reuse forward projection and fit consumers; update picking, scaleGroups/axes,
      desired dimensions, occurrence-local label layout, and `bandstep` together.
      Reject automatically fitted categorical offsets on statically gapped primary
      bands while preserving existing non-gapped offset behavior.
- [x] Bind expressions, normalize category cuts against completed domain state,
      update public specification types/JSDoc, and enable positional band/point-gap
      validation only once the renderers and ordinary axes work together. Correct
      step-based sizing for band/index/locus using the bounded rules above. Add
      one Core minor changeset covering band gaps and the step-sizing correction.
- [x] Extend focused categorical-resolution, offset, SVG gap/axis, and WebGPU
      resource/adapter/surface suites as needed for distinct failure modes. Reuse
      existing scale-group and index renderer regressions. Use a representative headless layout/structured SVG test for
      preferred extent, cell step, gaps, and rendered guides together; reserve GPU
      cases for shader lookup/fit behavior. Do not repeat the same sizing matrix
      per backend or mirror the geometry formula in standalone tests.
- [x] Extend view step regressions in the adjacent `view.gaps.test.js` with band padding/gaps and mapping-only
      updates, then an index partial-gap case where fractional ranks change without
      numeric endpoints changing. Include no-reflow when the gap footprint is
      unchanged, startup-empty/zero-span behavior, static-disabled compatibility
      versus reactive zero/empty specialization, and categorical-offset rejection.
      Verify subscription setup after inherited view-level scale/assembly config;
      reuse existing disposer registration for dynamic removal. Reuse existing grouped-bar tests for the
      unchanged non-gapped offset contract. Cover scrollable content with fixed
      viewport size using an existing layout test rather than a new harness.
- [x] Add one representative point-scale sizing/reversal regression: four
      unpadded points at a 20 px base step and one 8 px gap need 68 px. Preserve
      ordinary symbol geometry/picking and point-center guide endpoints.
- [x] Exercise real headless gapped specs through reorder/remove/reinsert,
      unchanged stable IDs, constant-disabled expressions, reactive enable/disable,
      and completed mapping observers. Review related tests for overlapping coverage.
- [x] Add a renderer-generic band-gap story and GPU regression alongside
      `packages/webgpu-renderer/tests/index-gaps.gpu.test.js`, including reordered
      sparse IDs and table updates. Confirm changing order/cuts does not rebuild
      retained row buffers. Build Storybook when modifying stories.
- [x] Document the categorical scaleGroups endpoint contract and unsupported
      interactions; use the documentation skill for schema/JSDoc changes.
- Commit: `552bbf189` — `feat(core): support grouping gaps on categorical scales`
- **Review gate:** downstream consumer semantics, retained resource lifecycle,
  occurrence sizing, categorical guides, and cross-renderer behavior.

### 3. User example and final integration

- [x] Deliver the User documentation approach above: separate categorical and
      index/locus guidance, embed the named-category example, explain fixed versus
      step-sized behavior, and synchronize authoritative JSDoc/generated references.
      Follow `examples/README.md` and the documentation skill. Verify that the
      88 px example describes plot width and that restrictions match implementation.
- [x] Browser-check the new example on WebGL, Canvas2D, and WebGPU: resize,
      hit-test cells beside both gaps, confirm empty gaps have no hit, and export
      SVG and raster. Verify reverse Y and unequal shared placements in structured
      SVG, and reactive cuts/width/order in headless and real GPU regressions.
      The shared-placement regression also checks occurrence-local CPU label
      overlap decisions. Keep the browser check behavioral rather than pixel-exact.
- [x] Recheck real examples `examples/docs/grammar/transform/dendrogram/clustered-heatmap-band.json`,
      `examples/docs/grammar/scale/grouping-gaps.json`, and
      `examples/core/marks/link/dendrogram-gaps.json`. Smoke-check existing leaf
      and branch rendering; preserve rank-space internal-node centering rather
      than asserting physical midpoints. Category projection and reorder are
      covered by the new shared mapping tests.
      Index navigation and half-open interval regressions must retain current behavior.
      This does not add automatic dendrogram group cuts.
- [x] Run relevant Vitest suites with the agent reporter, workspace type checks,
      applicable lint, GPU, docs/schema, and release checks. Stop when relevant
      checks pass; broaden only for concrete unresolved integration risks.
- [x] Obtain final integration review, resolve worthwhile findings, and reconcile
      every pending task before committing the plan's final state. Delete the plan
      in a later commit before merge; retain the active plan in draft PR discussion.
- Commit message: `docs(core): demonstrate categorical grouping gaps`

Verification consolidation: discard the proposed full manual browser combination
matrix (reverse/order/cuts, explicit point-selection UI, every export size/DPR,
and a separate annotation-track fixture). Headless publication/sizing tests,
structured SVG with real guides and unequal shared placements, retained WebGPU
tests including picking/exhaustion/recovery, and the three-backend browser
interaction/export checks protect those distinct contracts without duplicate
fixtures. Existing selection consumers retain their categorical behavior. No new
dendrogram layout contract is introduced; real examples are regression smoke checks.

Final verification on 2026-11-02:

- Full unit suite after structural simplification: 575 files, 5,462 tests passed.
- All workspace TypeScript checks passed; lint passed, with the last SVG test
  checked separately after addition.
- Real Chrome WebGPU regression: three cases passed. Renderer Storybook built.
- Schema generation, doc-type synchronization, affected-page macro rendering,
  and example schema/headless initialization passed. The example screenshot was
  captured and visually inspected.
- New heat-map browser behavior passed on all three backends: plot extent
  88 × 86 px, cell hits beside gaps, empty column/row gap hits, host resize,
  and successful SVG/raster exports without loading or browser errors. WebGPU
  used Chrome/Metal because the stock screenshot harness forces SwiftShader.
- Existing index grouping-gap, categorical clustered-heatmap, and dendrogram-gap
  examples passed WebGL smoke checks. Release validation passed with a Core minor
  changeset for this feature and its index/locus sizing correction.

## Acceptance criteria

1. Named rows/columns display independent fixed CSS-pixel gaps with equal cell
   bandwidths, correct categorical labels, and aligned annotation tracks.
2. Forward/reversed ranges, padding, explicit band anchors, singleton groups,
   and full-cell rectangular coverage agree across CPU/GPU. Automatically fitted
   categorical offsets on gapped primary bands fail clearly; non-gapped grouped
   bars and supported numeric pixel offsets keep their existing behavior.
3. Resize, reactive cuts/width, and domain reorder/filtering publish settled
   geometry, size, and guides while preserving domain values and stable IDs.
4. Picking and point selection identify cells beside gaps and no cell in a gap;
   CPU inversion reports no category for empty gap space.
5. At preferred extent, `step * dataSpace + displayedGapPixels` recovers the
   requested base step for band and gapped index/locus views. Fractional index
   gaps contribute fractional width, and same-footprint updates do not reflow.
   Fixed dimensions shrink cells; scrolling keeps viewport size fixed. Unequal
   shared placements and exports use their own allocated extent.
6. Disabled gaps follow existing band behavior without gap shader/resources;
   exhausted placements recover cleanly. Index/locus regression suites pass.
   Point scales share the categorical implementation, retain zero bandwidth,
   and size their intervals rather than fictitious cells.
7. The grammar example and sizing explanation let readers configure named-category
   gaps and predict plot size; generated references and documented restrictions
   agree with the implemented contract.

## Shipped boundaries and remaining risks

- **Nested offsets:** initially excluded as described above. Future automatic
  fitting needs occurrence-local renderer composition, not just an extra extent
  argument to `bandwidth()`. No solution for arbitrary extent-sensitive expressions
  is proposed by this feature.
- **Boundary ownership:** category-anchored cuts disappear when the named category
  is filtered out. Persistent group membership would require a different
  data/group contract, not an implicit fallback.
- **scaleGroups surface:** inclusive categorical endpoints extend the existing
  source. Automatic axes use band anchors 0 and 1 with these endpoints; numeric
  half-open endpoints are unchanged. The public reference documents both contracts.
- **Rounding:** the initial explicit rejection keeps scope bounded. Supporting
  rounded band cells while preserving exact gaps and backend parity needs a
  separate pixel-space rounding design, especially at fractional DPR/export size.
- **Size-dependent expressions:** step-sized gap inputs must not read the same
  axis's allocated extent. Existing graph refs reject direct reads and ordinary
  derived aliases. Cycles through imperative layout or delayed updates remain
  unsupported and cannot be reliably rejected by this bounded check.
- **Performance:** normalize category cuts on domain/mapping changes, retain
  immutable cut tables, and avoid allocations during drawing. Measure focused
  code size and representative heat-map update behavior before and after any
  shared-helper refactor; accept added machinery only for the explicit contracts
  above. Do not introduce navigation/rollback infrastructure for band scales.

## Plan review record

- Initial proposal committed as `ce89ed08e`.
- Independent subagent review identified missing occurrence-local geometry in
  CPU axis-label overlap/flush calculations. Addressed above with explicit
  geometry, invalidation, and unequal-member verification requirements.
- The review also identified the nested-offset bandwidth mismatch across unequal
  shared placements. The 2026-11-02 revision resolves initial scope by excluding
  automatically fitted categorical offsets rather than adding renderer machinery.
- Public enablement originally preceded working renderer/axis consumers.
  Corrected the milestones to keep preparation internal and defer public types,
  validation, expression wiring, and release notes until integrated support.
- Follow-up investigation clarified dendrogram scope: preserve rank-space
  internal-node centering, leaf alignment, and branch connectivity. Pixel-space
  recentering is separate work rather than an implied promise of band gaps.
- The 2026-11-02 revision derives preferred extent from the existing forward
  mapping, including index fractional gap ranks, and replaces the proposed
  parallel band-mapping API with the shared forward capability. No runtime
  abstraction or production code is added by this plan revision.
- The sizing/KISS/DRY review identified premature subscription initialization
  and reactive-zero denominator switching. Corrected both: connect mapping
  observers after scale configuration and keep static specialization stable.
  Extent-dependent gap expressions are explicitly outside the supported sizing
  contract; cheap enforcement of indirect dependencies remains an open question.
- Point gaps are included at the user's request through the same categorical
  implementation. The extra contracts are effective inner padding 1, zero
  bandwidth, point-center guides, and native point inversion/singleton behavior.
- Milestone 1 committed as `4a531ddf0`. Category-to-cut normalization stayed in
  milestone 2 with completed-domain publication, rather than entering the scale
  wrapper. The wrapper only consumes normalized numeric cuts.
- Implementation review caught three concrete issues: disabled gaps reading
  placement geometry for offsets, conditional immediate encodings bypassing their
  predicates, and offset-step sizing on zero-bandwidth primaries dividing by zero.
  Each has a regression and is fixed in milestone 2.
- Final independent integration review found no further blocking correctness or
  KISS/DRY issues. Its documentation suggestion was incorporated: offset-step
  sizing needs nonzero primary bandwidth; point primaries can use `for: "position"`.
- Initial size check after integration: the new CPU wrapper is 202 lines; index scale
  and mapping stay at 281/228 lines, `scalePosition.js` stays at 44, WebGL gap
  helpers grow from 53 to 83, and `view.js` grows from 1,894 to 1,947. WebGPU
  replaces its 78-line index helper with a 98-line shared grouping helper.
  Cut resources, fit checks, and forward consumers are shared; numeric navigation
  remains separate. No general scale or layout framework was introduced.
- A further structural review selected native affine compression and shared
  final-position tables, scale-owned preferred extents, shared gap properties,
  and one retained GPU metadata path. Independent review confirmed snapshot/copy
  independence, static-disabled behavior, point inversion, fractional index gaps,
  and offset-step composition. Full tests, workspace types, lint, three real GPU
  cases, and four WebGL examples passed after the change.
