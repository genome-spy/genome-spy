# Zoomable categorical scales

Status: proposed design, revised after KISS/DRY review and axis discussion,
2026-11-03. No feature implementation.
Baseline: `482e9a1d42d5b6bb1c293737a9cf0b647f229f3e`.
Issues: [zoomable band scale #647](https://github.com/genome-spy/genome-spy/issues/647),
[SampleView follow-up #573](https://github.com/genome-spy/genome-spy/issues/573).

## Decision

Give band and point scales a numeric **viewport in category-rank coordinates**,
separate from their complete ordered categorical domain. Treat that viewport as
the equivalent of the index scale's displayed numeric domain. Reuse index
navigation, including its current grouping-gap behavior, instead of defining a
second camera model or separate zoom and translation properties.

Keep `ScaleResolution.zoom(factor, anchor, pan, axisLength)` as the view hierarchy's
interaction boundary. Existing wheel, drag, touch, inertia, keyboard, concat-gap,
and facet routing already send normalized gestures through it. Adapt the state
read/commit below that boundary; no categorical gesture controller is needed.

Index, band, and point must share numeric band layout, inversion, gap navigation,
and interpolation. Band/point add category-to-rank lookup. Point remains the
existing band specialization with inner padding 1 and bandwidth 0. Locus inherits
the numeric path through index as it does today.

## Scope and architecture fit

Goals are opt-in categorical navigation, coherent shared scales/guides, stable
category identity, matching supported rendering/export/picking, and explicit
embedding and App persistence. Navigation must not rebuild category positions,
re-encode rows, or upload categorical lookup tables per frame.

SampleView migration, sticky summaries, scrollbars, peek policy, categorical
interval selection, and categorical constraints for viewport autoscaling remain
outside this feature. Point navigation is included through the same categorical
implementation, not through a separate milestone or policy.

Current ownership and source anchors:

- `packages/core/src/genome/scaleIndex.js` and `genome/indexGapMapping.js` own
  numeric band projection and gap-aware navigation. The latter already retains
  fractional gap-edge ranks and interpolates camera geometry.
- `packages/core/src/scales/scaleBand.js` implements band/point together, but
  `getMapping()` currently rebuilds all starts and an ordinal lookup after
  invalidation. Category lookup and changing geometry need separate lifetimes.
- `scales/domainRuntime.js` owns commands, transactions, animation, and publication;
  `domainLifecycle.js` owns source/readiness policy. `scaleInstanceManager.js`
  owns live scale mirroring, stable categorical IDs, and the final mapping ref.
- `scales/scaleInteractionController.js` currently navigates domains.
  `view/gridView/gridView.js`, `gridView/zoomNavigationUtils.js`, and `facetView.js`
  already route gestures by resolution and actual occurrence extent.
- `data/sources/lazy/axisTickSource.js`, `scale/ticks.js`, and
  `data/transforms/axisLabelLayout.js` own generated ticks and label layout.
  Expressions and renderers already depend on completed mapping publication.
- App's `bookmark/scaleDomainUtils.js`, `bookmarkState.js`, `bookmark.js`, and
  `app.js` currently serialize/observe zoomable state exclusively as domains.

Paths without a package prefix above are under `packages/core/src/`, except the
explicit App paths under `packages/app/src/`. State stays in Core's shared scale
resolution, renderer resources stay in renderers, and SampleView policy stays in
App. No per-view camera state or new scheduler is warranted.

[D3 band scales](https://d3js.org/d3-scale/band) preserve ordered categories and
project through category ranks. Keep that categorical contract. D3's
[rescaleX](https://d3js.org/d3-zoom#transform_rescaleX) and
[Vega domainRaw](https://vega.github.io/vega/docs/scales/#scale-properties) illustrate
continuous-domain navigation; GenomeSpy already has the numeric index model to
reuse without replacing categorical membership. Separate zoom/translation can
describe the same ordinary geometry, but a viewport gives shared scales a direct
visible-rank contract and matches index navigation vocabulary.

No external code copying is proposed. Preserve existing Vega BSD-3-Clause
provenance if band layout/inversion code moves; check licensing before any later
external adaptation.

## Scale and grammar contract

For domain `["A", "B", "C", "D"]`, categories have ranks 0 through 3 and the
full viewport is `[0, 4]`. Viewport `[1, 3]` displays B and C with normal padding.
Endpoints are floats in half-open rank coordinates for smooth pan/zoom. Numeric
categories remain category values; they do not become navigation coordinates.
Point uses the same rank window and its existing point padding semantics.

Use **scale viewport** for this rank interval and **layout viewport** for the
pixel rectangle controlled by `viewportWidth`/`viewportHeight`. Scale navigation
changes projection; layout scrolling moves already-laid-out content without
changing the scales. Retain the scoped `scale.viewport` spelling, and qualify
the terms in prose wherever both concepts appear. They can coexist without
sharing state or changing step-based layout sizing.

Use a single exact snapshot shape for categorical placement:

```ts
interface CategoricalViewport {
  interval: [number, number];
  gapRanks?: [number, number];
}
```

`gapRanks` has exactly the meaning of the existing index `gapDomain`: fractional
insertion ranks at viewport edges. It is shared navigation state, not a new gap
algorithm. `null` means fit all categories, derived from the current domain; it
is distinct from pinning a copied `[0, n]` interval. Getters return detached state.

### Methods

- Raw categorical scales gain `viewport()` / `viewport(value)` for the snapshot
  or null. Owned setters submit a runtime command; standalone scales apply
  directly. `copy()` preserves viewport, fit mode, and ordinary properties.
- Index and categorical scales expose the same internal
  `navigationMapping(axisLength?)` numeric geometry. It supplies numeric
  projection/inversion, `navigate`, and interpolation. Existing `gapMapping()`
  retains its consumer-facing category/numeric contracts and delegates to the
  same geometry; its presence alone is not a navigation capability check.
- Keep categorical tick generation's existing full-domain fallback. Rendering
  culling handles offscreen ticks/labels; no categorical `ticks()` method is
  required. See the axis contract below.
- Public resolutions gain `getViewport()` and
  `zoomToViewport(snapshotOrNull, options?: ZoomToOptions)` for band/point, with
  the same duration, cancellation, and immediate-render behavior as `zoomTo()`.
  Keep domain-based `zoomTo()` for existing scale kinds; reject it for categorical
  scales to avoid numeric-category
  ambiguity. An interval-only snapshot fits the requested window; snapshots with
  gap ranks preserve exact navigation state.
- Add one public `getScaleType()` query so host persistence can select domain or
  categorical viewport APIs without inspecting the implementation. Avoid a new
  navigation-strategy registry or serialization framework.

Keep `zoom()`, `isZoomable()`, `isZoomed()`, and `resetZoom()` as the common UI
surface. Domain getters remain categorical for band/point. `invert()` returns
categories, not fractional navigation ranks, and retains the existing band/point
hit semantics. `range()` stays layout-owned. `sizeForStep()` uses the whole
domain and configured base step, never the navigation viewport.

Add a `"viewport"` event for effective categorical placement changes; `"domain"`
continues to mean membership/order changes. Internal geometry uses the existing
mapping ref and zoom-publication bridge. Keep current mapping-related `"range"`
notifications compatible. Programmatic viewport placement works with gesture
zoom disabled, as programmatic domain navigation does today.

### Configuration

Use boolean `zoom` to enable band/point gestures on x/y. Both remain opt-in;
index/locus defaults stay unchanged. Encoding-level `scale` and view-level
`scales` declarations share the same property resolution.

```json
{
  "type": "band",
  "domain": ["A", "B", "C", "D"],
  "viewport": [1, 3],
  "zoom": true,
  "gapPositions": ["C"],
  "gapWidth": 8
}
```

Add `viewport?: [number, number] | null` to categorical positional scale grammar.
Absent/null means fit all; a literal interval sets the initial/reset viewport.
Keep authored configuration separate from displayed state. Defer viewport
expressions until a concrete consumer requires them; existing reactive categorical
domains and grouping-gap properties keep their current behavior.

Categorical navigation bounds are always derived from the complete domain:
`[0, domain.length]`. An initial smaller scale viewport does not restrict access
to the other categories. Do not expose `zoom.extent`, `"data"`, or `"unbounded"`
options for band/point; reject object-valued categorical `zoom` at the configuration
boundary. The shared navigation helper still receives numeric bounds internally.
`gapPositions` continues to list category identities. Index/locus zoom options
and inclusive author-facing interval conventions remain unchanged.

Validate finite literal intervals and supported channels at the grammar/API
boundary. Ordinary interval requests use the same one-band navigation limits as
index; exact gap snapshots follow existing index fractional-edge semantics.
Preserve ordinary rounded categorical scales; navigable categorical placement
requires `round: false`, as existing categorical gaps already do.

## Shared implementation and lifecycle

### DRY numeric geometry

Extract/reuse one small numeric band-mapping helper from current index and band
geometry. It owns step/start/bandwidth, padding/alignment, signed range, cuts,
inversion, navigation, and interpolation. Use its ungapped fast path too; do not
copy the index zoom formula into a new categorical branch or keep duplicate
ungapped formulas in index and band. Keep ordinary rounded categorical behavior
in the shared layout calculation without enabling rounded navigation.

Category-to-rank lookup changes only with membership/order. Band/point forward
projection wraps the numeric mapping; point remains the existing `pointish`
specialization. Preserve the distinction between index's signed rank-leading
edge and categorical physical low-edge starts with positive bandwidth/step.
For reversed bands, within-band position b maps to numeric position 1-b. Keep
point's zero bandwidth and apply pan reversal exactly once.

Use shared projection helpers within each renderer after categorical lookup,
rather than adding another band/point navigation formula. Preserve the ungapped
resource fast path. Do not turn this focused shared calculation into a general
scale framework or refactor unrelated scale types.

### Commit and publication

Add categorical viewport state to the existing runtime's command/animation
boundary. A narrow branch chooses numeric domain or numeric viewport as the
navigation target. Keep existing source policy in `domainLifecycle.js`; do not
make collector/readiness inputs generic camera state or introduce a second
runtime. Numeric viewport commands must bypass categorical `normalizeDomain()`.

Use one complete numeric navigation target, interval plus optional gap ranks, for
index, band, and point transitions. Preserve it through normalization/copy,
target-mapping construction, animation frames, and the final commit. Today's
`DomainTransition.target` stores only the domain and finish clears gap ranks;
extend that shared path rather than adding categorical-only animation machinery.
Existing index targets without gap ranks retain their current behavior.

Categorical domain policy remains discrete and accepts membership/order changes
even when gestures are enabled. The current domain `policy.zoomable` protects
numeric displayed domains after initialization; it must not protect a navigable
band/point's category list. Distinguish domain navigation from gesture eligibility.

`ScaleInstanceManager` mirrors viewport separately from domain and includes it in
mapping dependencies/equality. A viewport frame publishes geometry and zoom state,
not a category-domain event, indexer mutation, cut upload, or row re-encoding.
Reuse current owner transaction, transition cancellation, disposal, and completed
mapping observation for expressions, dependent offset ranges, guides, and rendering.

Fit mode follows membership changes. Navigated scale viewports preserve rank
positions across reorder/growth and reconcile against the full domain when settled
membership shrinks. Reuse existing readiness so bootstrap partial domains cannot
destroy an authored window. Cancel/reconcile stale viewport animation on membership
or gap-topology changes; resize recomputes occurrence geometry. Identity anchoring
after sorting/filtering is App policy, not implicit Core behavior.

### Preserve index gap semantics

Pass categorical ranks, viewport interval, and fractional edge ranks through the
same index gap mapping. Preserve current fixed CSS-pixel widths, pointer anchors,
pan, interpolation, minimum-step handling, and occurrence-local sizing. Extend
existing index regression coverage with categorical adapters rather than inventing
separate categorical gap rules.

Do not add a band/point-only no-fit restriction or require an alternative camera
because of gaps. Retain existing shared exhausted-gap behavior, including the
numeric navigation fallback while affected marks are hidden. Any concrete defect
found in that shared behavior belongs in the helper with a regression, not in a
new categorical policy. Such a defect is not a prerequisite for this feature.

Reuse index's reference-span/current-navigation-span semantics for `zoomLevel()`
and its reactive publication; read the categorical viewport rather than category
values. Do not introduce a separate slope-based categorical zoom metric. Changes
to gap-related zoom metrics, if needed, must be designed consistently for all
three scales rather than bundled as a categorical special case.

### Axis ticks and labels

Retain all categorical ticks (or authored `axis.values`) and cull their offscreen
rendering. A scale-viewport change must not regenerate tick data simply because
different categories became visible. Visible-only tick generation is a possible
later optimization, not a scale API requirement.

Existing culling primitives suffice, but their axis wiring needs extension.
`GridChild.getAxisLabelClipPolicy()` currently selects anchor culling primarily
for layout-scroll viewports; ordinary tick rules use `clip: false`. Reuse
directional label-anchor culling and tick-rule clipping/clamping for navigable
categorical axes while retaining labels/ticks outside the plot in the perpendicular
direction. Do not rely on canvas-edge clipping or numeric x indexing, which does
not cover categorical tick rules/text. Keep numeric rank bounds out of tick labels.

Add optional `axis.labelSqueeze: boolean`, default false, for band axes. Each
label fits independently within its own band's span along the axis, excluding
scale padding and grouping gaps. Generate band-edge ranged text in the main
direction and keep its normal perpendicular placement and `labelPadding`.
Reuse TextMark's `fitToBand`/ranged-text machinery and `squeeze: true`, rather
than adding a second fitting algorithm or CPU label-placement pass. Existing
rotation-aware bounds, uniform glyph scaling, and tiny-label fade/hide behavior
apply; labels do not grow beyond the configured font size.

When squeezing is enabled, bypass label-overlap removal, including an explicit
`labelOverlap` setting: labels occupy disjoint band spans. Keep offscreen culling
and any text measurement needed by ordinary axis sizing. When squeezing is off,
preserve existing label behavior; if overlap removal is requested, offscreen
candidates must not suppress visible labels. Enable squeezing only for band
scales: point has zero bandwidth, and index/locus tick labels retain their current
tick-selection and overlap behavior.

## Consumers

- **Input:** keep GridView/facet/shared-resolution discovery and gesture routing.
  Broaden categorical eligibility once; common navigation/reset targets use the
  narrow numeric-state adapter. Existing default mark clipping follows zoomability.
- **CPU, Canvas2D, SVG:** category -> rank -> shared occurrence mapping; keep exact
  categorical hit inversion separate from numeric navigation inversion.
- **WebGL:** replace full-domain-only categorical geometry inputs with viewport
  state and gap ranks. Keep stable ID/rank tables, update camera uniforms, and
  cover visual marks plus picking and band-relative sizes/offsets.
- **WebGPU:** extend public band/point scale options and retained `ScaleSlotHandle`
  with an atomic viewport update/reset. Keep numeric renderer APIs independent of
  Core grammar. Use documented exports in the Core adapter, retain series/domain
  buffers during navigation, and add one focused retained-update story.
- **Axes:** retain categorical tick data and reuse culling and band-label squeezing
  as specified above. Existing mapping publication updates placement and any
  requested overlap layout; scale groups retain their identity/projection.
- **Selections and sources:** preserve category IDs for point selections and the
  continuous-only interval-selection boundary. Keep genomic source domain events
  and existing continuous constraints for viewport-derived autoscaling.
- **App:** add optional `scaleViewports` beside existing `scaleDomains` in bookmark
  and URL payloads, covering band and point together. Observe viewport events,
  restore order before placement, and preserve old domain-only payloads. Fit mode
  can be omitted. Keep navigation outside undoable sample provenance. This is
  needed even before SampleView migrates.

## Documentation presentation

Keep `docs/grammar/scale.md` as the canonical authoring explanation. No separate
navigation page or new site-navigation item is needed. Introduce the common
navigation model before its grouping-gap and autoscaling consumers.

Proposed reading order after the existing Index/Locus introductions:

1. **Zooming and panning:** move the existing section before Grouping gaps. Explain
   enabling navigation once for positional scales, including band/point opt-in
   and unchanged index/locus defaults.
2. **Categorical viewports** within that section: distinguish the full domain from
   rank placement; use `["A", "B", "C", "D"]` and `[1, 3]`, explain fractional
   endpoints, fit/reset, and point's shared behavior. Embed one small fixed-size
   mixed categorical/index example so the equivalent navigation is visible.
3. **Zoom extent:** keep `SCHEMA ZoomParams` explicitly scoped to continuous,
   index, and locus navigation. Explain categorical full-domain bounds with the
   scale viewport, not as configurable extents. Preserve the existing genomic
   endpoint-convention explanation.
4. **Grouping gaps**, then existing **Nested offset scales** and **Viewport
   autoscaling**: keep gaps focused on boundaries, fixed pixels, and sizing. Link
   back to navigation instead of repeating zoom semantics. Autoscaling remains a
   separate continuous-constraint feature.

Move **Domain transitions** from under Zooming and panning to **Reactive scale
properties**, preserving its anchor. This distinguishes source-domain changes
from host-requested viewport animation. Add a short link from navigation to the
programmatic API for transition options.

Content ownership:

| Source                                                                         | Content                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/core/src/spec/scale.d.ts`                                            | Authoritative categorical `viewport` and boolean `zoom`, with configurable zoom extents limited to supported noncategorical scales. Reuse generated property docs rather than duplicating catalogs in prose.                                                                         |
| `docs/grammar/scale.md`                                                        | Relationships, coordinate examples, fit/reset, shared-scale authoring, and links. Update the old assertion that categorical gaps cannot zoom; retain brushing limits. Distinguish scale viewport from layout `viewportWidth`/`viewportHeight` with a short link to scrollable views. |
| `docs/grammar/composition/concat.md#scrollable-viewports`                      | Replace the categorical-no-zoom assertion. Explain that pan changes a scale's numeric navigation window (domain or categorical viewport), while layout scrolling moves already-laid-out content. Link the common navigation section without repeating its tutorial.                  |
| `docs/grammar/expressions.md#scale-functions`                                  | Explain that categorical `domain()` stays categorical and placement-dependent expressions react to navigation; use the common zoom metric. Link configuration back to Scales.                                                                                                        |
| `packages/core/src/types/scaleResolutionApi.d.ts`                              | Exact snapshot/method/event semantics, fit mode and transition options. Regenerate TypeDoc under `docs/api/reference/`; do not edit generated files manually.                                                                                                                        |
| `docs/api/runtime-state.md#named-scales`                                       | Add Categorical viewports after Domains, then broaden Domain events to Scale state events. Show only essential read/navigate/observe calls and link a runnable synchronization example. Preserve old heading anchors where links need compatibility.                                 |
| `docs/grammar/parameters.md`                                                   | Keep interval selection's continuous-scale requirement clear; link to categorical navigation where useful.                                                                                                                                                                           |
| `packages/core/src/spec/axis.d.ts` and `docs/grammar/axis.md#ticks-and-labels` | Define `labelSqueeze` and its band-only/default-false behavior in specification JSDoc. Explain per-band fitting and its precedence over overlap removal next to the existing overlap discussion; use the generated property reference and link to ranged text.                       |
| `docs/sample-collections/app-features.md#bookmarking`                          | State that bookmarks retain categorical navigation too; keep payload internals out of user prose.                                                                                                                                                                                    |

Add one self-contained `examples/docs/grammar/scale/zoomable-band.json` using
synthetic inline/local data and a categorical axis plus an index axis. Demonstrate
point through a short configuration variation, not a second near-identical spec.
Keep `band-grouping-gaps.json` focused on gaps/step sizing; use an `examples/core/`
integration variant for zoomed gaps and shared labels. Extend existing `scaleApi`
or `linkedEmbeds` examples for exact viewport synchronization. Follow
`examples/README.md`; do not import examples or add maintained `$schema` fields.
Demonstrate `labelSqueeze: true` in the categorical example, with a short note
linking to axis label fitting. Keep the fitting explanation on the Axis page and
the text-scaling mechanics on the Text page.

No backend inventories, gap-edge serialization details, controller internals, or
SampleView migration rationale belong in the introductory grammar explanation.
Renderer-generic retained viewport updates belong in the renderer README/story.

## Milestones and verification

### 1. Shared numeric layout and categorical viewport

Outcome: index, band, and point use one numeric mapping/navigation path, with
categorical lookup separated from camera geometry. Existing index/locus behavior
and ordinary band/point output remain compatible.

Areas: numeric mapping, categorical wrappers/types, copy/reset, standalone tests,
renderer public viewport options/retained updates and a generic story.
Verify fit output, existing rounded categorical output, fractional navigation,
numeric category identity, reversal/padding, point specialization, exact gap-edge
round-trips, and retained buffer stability. Extend the existing index gap tests
for adapter-specific contracts; avoid repeating identical numeric tests for each
wrapper. Document the renderer contract alongside it.

Tentative commit: `feat(core): share band layout and add categorical viewports`.

### 2. Core grammar, lifecycle, guides, and interaction

Outcome: grammar-authored categorical navigation works through existing gestures,
shared resolutions, all projection backends, and public embedding APIs.

Areas: spec/config, runtime/mapping, controller adaptation, renderer adapters,
axes/expressions, band-axis `labelSqueeze`, public viewport APIs/events. Focus
headless subsystem tests on real specs: movement without category mutation,
late membership/reorder, readiness,
reset/cancellation, ticks, offsets, and unchanged step-based layout. Use
`test-genomespy-views` for structured output; browser-test DOM/input/GPU contracts
with `debug-genomespy-web`. Follow `write-genomespy-docs` for the documentation
structure above, schema/API regeneration, and the example.

Tentative commit: `feat(core): enable categorical scale navigation`.

### 3. App persistence and composed integration

Outcome: band/point placement saves/restores alongside genomic domains, with
SampleView migration remaining independent. Cover mixed bookmark/URL round-trips,
fractional gap edges, category-order restoration, old payloads, and default reset.
Add App documentation and the feature changeset using `write-genomespy-changeset`.

Final composed checks:

- Navigate a categorical-x/index-y plot with layered rects/text, shared concat
  spacing, and facet occurrences of different sizes. A shared resolution moves
  once; categories and fixed CSS gap widths remain stable.
- Exercise a zoom-enabled variant of
  `examples/docs/grammar/scale/band-grouping-gaps.json` and the neighboring
  `examples/docs/grammar/transform/dendrogram/clustered-heatmap-band.json` with
  order changes, resize, picking, and export. Include point as the same projection
  with zero bandwidth and an appropriate point mark.
- Keep the categorical tick set stable during navigation and verify offscreen
  tick/label culling, including explicit tick values. On band axes, verify label
  squeezing along x/y, rotated labels, proportional/fixed gaps, and zoom, without
  overlap removal. Reuse text-fitting coverage for shared mechanics; preserve
  default unsqueezed categorical and existing index/locus label behavior.
- Check Canvas2D/SVG output against live GPU placement and picking. At the
  existing retained-resource boundary, verify viewport frames do not rebuild
  category lookup/cut tables or re-encode data. No new benchmark framework.
- Verify linked-embed synchronization and mixed categorical/locus persistence
  without changing existing genomic endpoint conventions.
- Animate restoration of an exact snapshot with fractional gap edges and verify
  the final projection retains its interval and gap ranks. Cover this shared
  transition contract once, rather than repeating identical numeric cases for
  index, band, and point.

Tentative commit: `feat(app): persist categorical scale viewports`.

Run narrow relevant Vitest suites with the `agent` reporter, affected type/lint
checks, generated schema/API/doc checks, and GPU/story checks when applicable.
Review related coverage for duplication as the shared path replaces older code;
retain wrapper-specific identity and inversion contracts. Stop when relevant
checks pass. These milestones belong to one coherent feature branch; do not
declare the feature complete before rendering and persistence consumers work.

## Risks and delivery

The main risks are accidentally freezing categorical membership, changing
ordinary band/point projection while sharing geometry, and missing a mapping
consumer or persistence caller. Existing shared index gap semantics are a reuse
requirement, not an unresolved band-specific camera design question.

Rank windows preserve positions in display order, not category identity after
reorder/filter. SampleView may later provide identity anchoring and row-height
policy. Confirm exact public method/type spellings during implementation, while
keeping one viewport meaning across band and point.

This plan-only contribution has no release impact and needs no changeset.
Retain the plan on the feature branch for discussion; reconcile and retire it
before merge under `plan-genomespy-change`. Implementation is not authorized by
the request to revise and commit this plan. The requested independent KISS review
is complete; its shared-transition and scrolling-documentation findings are
incorporated above. The subsequent axis discussion simplifies categorical ticks
and zoom configuration and adds optional label squeezing through existing text
rendering; these refinements have not had a further independent review.
