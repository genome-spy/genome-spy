# Grouping gaps for band scales

Status: proposed; investigation and planning only. No runtime changes are part
of this branch. Implementation milestones below are intentionally pending.

## Motivation and scope

Categorical heat maps need visible separators between selected rows or columns
without replacing category values with manually maintained integer indices.
Index and locus scales already offer `gapPositions` and `gapWidth`, but enabling
them on a band scale currently fails validation. Uniform `paddingInner` cannot
express larger separators at selected group boundaries.

Extend positional `band` scales with fixed CSS-pixel grouping gaps. Keep equal
cell bandwidths, category identities, explicit domain ordering, aligned axes,
shared annotation tracks, picking, and export consistent. Support gaps on both
heat-map axes, fixed/stretch dimensions, and step-based dimensions. Nested
categorical offsets in unequal shared placements require the explicit contract
decision below; ordinary heat-map cells do not depend on that extension.

Non-goals: categorical zoom/pan or interval brushing; grouping gaps on `point`,
`ordinal`, color, or offset scales; automatic clustering/group discovery; group
labels, dendrogram splitting, variable widths per cut, and new App sample-layout
behavior. Existing index/locus behavior must remain unchanged.

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
  an index-like scale and coerces datum values to numbers. Other consumers make
  similar assumptions, including `scalePosition.js`, interval selection, and
  `utils/expression.js::bandstep`. Do not make a categorical band pretend to
  implement the index navigation contract.
- `src/view/view.js::getDimensionSize` currently calculates step-based size as
  `bandSpace(count, paddingInner, paddingOuter) * effectiveStep`. Its size-cache
  invalidation observes domain changes only. Gap changes also affect desired
  dimensions. Nested offsets derive ranges from primary `bandwidth()` in
  `scalePropsResolver.js` and must receive the reduced cell width.
- `src/view/axisView.js` installs `scaleGroups` for any statically enabled gaps,
  but `src/data/sources/lazy/scaleGroupsSource.js` accepts only numeric index/locus
  intervals. Merely loosening the band-scale validation would break axes.
- Rendering ownership follows `packages/core/docs/architecture/rendering.md`:
  Core owns scale semantics; backends own gap tables and GPU resources; immediate
  projection is shared by Canvas2D/SVG. WebGPU remains behind its public package
  API and cannot import Core grammar or depend on WebGL internals.

## Proposed public contract

Reuse the existing properties. For a band scale, `gapPositions` lists **domain
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
- Keep the ordinary band lookup/copy/padding/alignment/inversion behavior.
  Point inversion wholly within padding or a grouping gap returns `undefined`;
  `invertRange` returns only intersected categories in domain order.
- Initially reject `round: true` with statically enabled band gaps. GenomeSpy's
  normalized positional ranges and existing GPU formulas do not provide a sound
  cross-renderer rounding contract. Do not silently accept conflicting rounding
  and fixed CSS-pixel widths. Disabled-gap band scales retain existing rounding.

## Geometry and implementation decisions

### A small categorical mapping, with shared cut infrastructure

Add a Core band-scale implementation, tentatively
`packages/core/src/scales/scaleBand.js`, integrated through `src/scale/scale.js`.
Prefer composition with the existing Vega band constructor for ordinary setter,
domain normalization, and disabled-gap behavior. Preserve the public type `band`
and discrete traits. Do not build a general discontinuous-scale framework or
refactor the index navigation machinery as a prerequisite.

Expose a distinct internal `bandGapMapping(extent)` capability, not index
`gapMapping()`. It provides positive base step/bandwidth, categorical and dense
rank positioning, and `fits`. Keep canonical domain/cut state on the scale and
cache placement-local geometry by CSS extent; invalidate on relevant setters.
Rendering uses the actual occurrence extent, including repeated/faceted and
export-sized placements, without mutating a shared scale for each draw. Ordinary
scale calls and metadata use the resolution's existing default extent contract.
That default is insufficient for automatically derived nested offset ranges:
their pixel widths must be resolved per occurrence or the unsupported combination
must be rejected explicitly. Do not claim arbitrary `scale()`/`bandwidth()`
expressions become occurrence-local merely by updating renderer projection.

For a nonempty domain of `n` categories, `m` effective internal cuts, pixel extent
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

### Publication, layout, and expressions

Resolve category values to dense numeric cuts from `DomainState.visibleDomain`
inside completed mapping publication. Recompute when either domain membership/
order or gap input changes, even if the gap input array has the same identity.
Publish immutable numeric cuts and width together with domain mapping; preserve
stable category IDs. Avoid per-row or per-frame sorting and allocations.

For step-sized band dimensions add `m * gapWidth` after the existing effective
step calculation, including `step.for = "offset"`. Observe the gap inputs and
domain needed for this desired size, without causing size/range feedback loops
or reflow on every mapping notification. Fixed/stretch dimensions instead reduce
cell bandwidth. Verify that supported offset-scale ranges and `bandwidth()`
dependencies settle after gap or layout changes. When a primary band is shared
across unequal extents, its normalized bandwidth depends on the occurrence:
`bandwidth(E) = (abs(R) - m * gapWidth / E) / space * (1 - paddingInner)`.
Thus the current `bandwidth('x') * width` derived offset range cannot be reused
unchanged. A correct extension must derive the nested range from the parent
mapping at the same extent, consistently on every backend, without mutating
shared scales. Keep this design gate open rather than hide the problem behind
invalidation tests. Extend `bandstep(channel, extent)` explicitly for band
geometry; retain its signed base-step meaning and required extent for gapped
scales. It cannot represent category-specific displacement across a cut.

Categorical dendrograms retain their existing dense-rank midpoint semantics:
leaves align with cells and shared-node endpoints join, but internal branches
are not necessarily centered between children in pixel space across gaps.
Their category anchors plus fractional base-step offsets cannot express that
stronger contract. Physical recentering would require hierarchy-aware projected
layout and is outside this feature.

### Axes and scale groups

Extend `scaleGroups` deliberately to band scales so the existing automatic
segmented-axis behavior remains available. Preserve all numeric half-open
index/locus fields and semantics. For band axes, each row represents a contiguous
category group; `Start` and `End` contain the categories at the lower and higher
numeric projected edges, respectively. Render with `band: 0` and `band: 1`.
Swap endpoint categories when the scale range reverses; `Group` numbering stays
in logical domain order. A singleton group has identical endpoint categories.
These categorical endpoints are inclusive cell identifiers, not half-open indices.

Update `ScaleGroupsData` JSDoc, source validation/publication, axis encodings, and
lazy-source docs together. Depend on active domain, effective cuts, and range
direction; keep guides domain-inert. Test mixed band/index axes and the Cartesian
product. Ordinary ticks, labels, and grid lines use category encodings. Update
`axisLabelLayout.js` both to use the actual axis occurrence's extent and
`bandGapMapping(extent)` for CPU positions, and to invalidate on reactive gap
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
  endpoints, nested offsets, and export-size behavior. Do not coerce categories
  with `Number()` or use index peer endpoint corrections.
- **WebGPU:** extend the renderer-generic public band scale API with numeric dense
  cuts/width and live updates. Update Core's `webGpuMarkAdapter.js` band config
  and `webGpuSurface.js::compileChannelBindings`. In the renderer, audit
  `defs/band.js`, `scales/indexGaps.js`, `programs/internal/scaleResources.js`, and
  shader assembly gates. Derive gap geometry from `[0, normalizedDomain.length]`,
  not sparse categorical IDs; update the domain map and cut geometry together.
  Share table/fit infrastructure without imposing index `gapDomain` navigation
  state. Keep renderer examples generic and typed-array based.

## Established designs and alternatives

- [D3 band scales](https://d3js.org/d3-scale/band) establish categorical band
  lookup, within-band anchors, and uniform padding. Preserve those concepts;
  selected fixed-pixel separators are an additional GenomeSpy capability.
- [Vega band scales](https://vega.github.io/vega/docs/scales/#band-scales) distinguish
  fixed extent and fixed step. Follow the installed Vega implementation's exact
  geometry/inversion behavior rather than assuming all D3 formulas match.
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

## Implementation milestones and review gates

### 1. Internal categorical scale geometry

- [ ] Implement the internal band mapping, category-to-cut normalization, scale
      composition, copy/inversion behavior, and disabled fast path. Keep public
      band-gap validation and specification types unchanged until milestone 2;
      ordinary consumers must never observe enabled gaps before they support them.
- [ ] Verify direct scale behavior for string, numeric, and boolean categories;
      padded singleton/empty domains; reverse/align; reordered cuts; gap inversion;
      exhaustion and recovery. Retain existing headless categorical/index-gap
      regressions. Prefer representative contracts over setter-shape assertions.
- [ ] Document internal capability semantics; no changeset is needed for this
      preparatory milestone without observable behavior changes.
- Tentative commit: `refactor(core): prepare categorical band gap geometry`
- **Review gate:** proposed public API, categorical identity, geometry, and the
  rounding boundary before downstream consumers are finalized.

### 2. Heat-map rendering, guides, and sizing across backends

- [ ] Integrate WebGL, immediate/SVG, and generic WebGPU band mapping/resources;
      update fit checks, picking, scaleGroups/axes, desired dimensions, nested offset
      bandwidth for the supported contract, occurrence-local label layout, and
      `bandstep` together. Resolve the nested-offset gate or explicitly exclude
      unsupported combinations before asserting parity.
- [ ] Bind expressions, normalize category cuts against completed domain state,
      update public specification types/JSDoc, and enable positional band-gap
      validation only once the renderers and ordinary axes work together. Add one
      Core minor changeset for the feature and reuse it through integration.
- [ ] Extend existing focused tests in `scaleResolution.categorical.test.js`,
      `offsetScale.test.js`, `scaleGroupsSource.test.js`, SVG gap/axis suites, WebGL
      shader/resource suites, and WebGPU adapter/surface suites. Add structured SVG
      and layout tests using `test-genomespy-views`, including unequal shared-scale
      placements and reactive step sizing. Assert pixels/geometry and source rows,
      not only generated strings.
- [ ] Exercise real headless gapped specs through reorder/remove/reinsert,
      unchanged stable IDs, constant-disabled expressions, reactive enable/disable,
      and completed mapping observers. Review related tests for overlapping coverage.
- [ ] Add a renderer-generic band-gap story and GPU regression alongside
      `packages/webgpu-renderer/tests/index-gaps.gpu.test.js`, including reordered
      sparse IDs and table updates. Confirm changing order/cuts does not rebuild
      retained row buffers. Build Storybook when modifying stories.
- [ ] Document the categorical scaleGroups endpoint contract and unsupported
      interactions; use the documentation skill for schema/JSDoc changes.
- Tentative commit: `feat(core): render grouped categorical heat maps across backends`
- **Review gate:** downstream consumer semantics, retained resource lifecycle,
  occurrence sizing, categorical guides, and cross-renderer behavior.

### 3. User example and final integration

- [ ] Add a small two-axis categorical heat-map example and explain value-based
      cuts, ordinary padding, fixed pixel widths, filtering, and numeric categories
      in `docs/grammar/scale.md`. Follow `examples/README.md` and documentation skills;
      regenerate schema/doc types instead of editing generated output manually.
- [ ] Browser-check the new example on WebGL, Canvas2D, and WebGPU: resize, reverse
      Y, change cuts/width/order, hover and point-select cells beside gaps, confirm
      empty gaps have no hit, then export SVG and raster at a different size/DPR.
      Include a shared annotation track and unequal repeated placements.
- [ ] Recheck real examples `examples/docs/grammar/transform/dendrogram/clustered-heatmap-band.json`,
      `examples/docs/grammar/scale/grouping-gaps.json`, and
      `examples/core/marks/link/dendrogram-gaps.json`. Categorical dendrogram leaves
      must align and branch joins remain connected after gaps/reorder; preserve
      rank-space internal-node centering rather than asserting physical midpoints.
      Index navigation and half-open interval rendering must retain current behavior.
      This does not add automatic dendrogram group cuts.
- [ ] Run relevant Vitest suites with the agent reporter, workspace type checks,
      lint, relevant GPU tests, docs/schema checks, and release checks. Broaden to the
      full unit suite because shared scale/rendering contracts cross packages.
- [ ] Obtain final integration review, resolve worthwhile findings, and reconcile
      every pending task before committing the plan's final state. Delete the plan
      in a later commit before creating a PR or merging.
- Tentative commit: `docs(core): demonstrate grouping gaps on categorical heat maps`

## Acceptance criteria

1. Named rows/columns display independent fixed CSS-pixel gaps with equal cell
   bandwidths, correct categorical labels, and aligned annotation tracks.
2. Forward/reversed ranges, padding, explicit band anchors, singleton groups,
   and full-cell rectangular coverage agree across CPU/GPU. Nested offsets have
   either an agreed occurrence-local contract with matching tests or a clear
   unsupported boundary; no silently incorrect sub-band widths are accepted.
3. Resize, reactive cuts/width, and domain reorder/filtering publish settled
   geometry, size, and guides while preserving domain values and stable IDs.
4. Picking and point selection identify cells beside gaps and no cell in a gap;
   CPU inversion reports no category for empty gap space.
5. Step-sized dimensions grow by total gap width; fixed dimensions reserve space
   by shrinking cells. Unequal shared placements and exports use their own extent.
6. Disabled gaps follow existing band behavior without gap shader/resources;
   exhausted placements recover cleanly. Index/locus regression suites pass.

## Risks and questions to confirm before implementation

- **Nested offsets in shared placements:** choose between introducing a
  renderer-neutral per-occurrence parent-bandwidth contract and explicitly
  rejecting nested categorical offsets where the parent extent differs from
  its resolution default. This also affects export-sized layouts. The current
  `bandwidth('x') * width` expression does not solve it. No general solution for
  arbitrary extent-sensitive expressions is proposed by this plan. The smallest
  initial scope would reject all automatically inferred categorical offset ranges
  on statically gapped primary bands, keeping explicit numeric pixel offsets under
  their existing owner-size semantics. Adding an extent argument to `bandwidth()`
  alone cannot make a shared offset scale placement-aware.
- **Boundary ownership:** category-anchored cuts disappear when the named category
  is filtered out. The proposal deliberately chooses this simple rule. Confirm
  whether heat maps instead need persistent group membership through filtering;
  that would require a different data/group contract, not an implicit fallback.
- **scaleGroups surface:** the proposed inclusive categorical endpoints extend a
  source currently documented only for numeric half-open intervals. Confirm this
  type-specific contract before shipping; a dedicated categorical guide source
  is an alternative if it makes user-authored guides clearer.
- **Rounding:** the initial explicit rejection keeps scope bounded. Supporting
  rounded band cells while preserving exact gaps and backend parity needs a
  separate pixel-space rounding design, especially at fractional DPR/export size.
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
  shared placements. Recorded as an unresolved contract decision, with the
  incorrect existing expression and two possible scope choices stated above.
  The initial unconditional nested-offset acceptance promise has been removed.
- Public enablement originally preceded working renderer/axis consumers.
  Corrected the milestones to keep preparation internal and defer public types,
  validation, expression wiring, and release notes until integrated support.
- Follow-up investigation clarified dendrogram scope: preserve rank-space
  internal-node centering, leaf alignment, and branch connectivity. Pixel-space
  recentering is separate work rather than an implied promise of band gaps.
