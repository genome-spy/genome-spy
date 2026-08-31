# View-scoped MSAA layers cleanup plan

Status: Proposed

Issues: #478, #483

## Context

The selective compositing work has the required low-level capabilities, but the
Core adapter currently forms MSAA groups from consecutive draw occurrences. A
logical mark repeated through sample placements can therefore create a new
multisampled attachment, resolve, and composite whenever another mark appears
between its occurrences.

The MCCA WebGPU example demonstrates the failure mode. The current ordered
draw-level implementation creates 247 composite bindings in a representative
frame and produces wheel-zoom frame intervals with a roughly 33–34 ms p95.
Moving every repeated MSAA occurrence to its mark's first paint position reduces
the work to single-digit or low-double-digit groups and restores roughly 17 ms
frame pacing, but it changes painter's order and can apply the first view's
opacity to later occurrences. That workaround is not correct.

A conservative attempt to commute only draws with disjoint submitted bounds
preserved correctness but did not improve the MCCA case: 203 of 225 barriers
were interleaved single-sampled draws whose submitted bounds conservatively
overlapped the MSAA draws. The frame remained at 247 groups. Draw-occurrence
reordering is therefore the wrong abstraction.

The existing view hierarchy already contains the intended layer boundaries:

- In the 2024 paper example, `cnv-segments` contains the `CNV` and `LOH`
  rectangle marks, while `mutations` is its following point-mark sibling. The
  live `cnv-segments`, `CNV`, and `LOH` bounds are all 880 × 1073 logical pixels.
  CNV and LOH can render in one ordered MSAA layer, resolve once, and leave
  mutations on the direct path afterward.
- In MCCA, `transcripts` is the semantic-opacity container. Its `exons`
  rectangle child needs coverage antialiasing, while its `bodies` rule child
  remains single-sampled. The correct representation is one ordinary
  composited transcript layer containing an exon MSAA leaf followed by direct
  gene-body draws.
- Copy-number segments, metadata cells, and cytobands likewise belong to their
  existing view containers. Samples are placements inside those layers; they
  are not layer boundaries.

The current production code involved in frame grouping and transient rendering
is already substantial: `webGpuViewRenderingContext.js`,
`canvas2DViewRenderingContext.js`, `renderer.js`, `renderGroups.js`, and
`renderingIntent.js` contain 3,469 lines. Since the initial selective
compositing commit, the broader rendering and test paths have grown by 2,381
insertions and 539 deletions. Much of that growth implements export and
correctness that must remain, but the final cleanup should reduce production
code in the frame/compositing paths rather than add another planner hierarchy.

## Goals

- Form MSAA layers from existing view-container scopes rather than mark
  occurrences, facet instances, or sample placements.
- Render all compatible descendants of a maximal container in one ordered
  multisampled pass and resolve it once.
- Represent mixed-geometry containers with ordinary compositing and nested MSAA
  groups so only eligible marks use four-sample coverage.
- Preserve local opacity, clipping, painter's order, picking, and placement
  semantics without speculative draw commutation outside an explicit repeated
  sample-facet batch.
- Keep the compiled layer topology independent of live opacity, and make the
  WebGPU renderer choose the zero, one, or fractional-opacity path every frame.
- Restore smooth MCCA WebGPU interaction with GPU work proportional to semantic
  layers rather than sample count.
- Preserve WebGPU full raster and hybrid SVG export from issue #483.
- Keep Canvas2D group opacity correct while eliminating per-frame offscreen
  canvas allocation after warm-up.
- Delete occurrence-level grouping code and keep renderer branching limited to
  the paths required by live opacity.

## Non-goals

- No changes to the legacy WebGL renderer.
- No global MSAA mode and no MSAA for point, text, rule, or decorated rectangle
  marks that do not request coverage antialiasing.
- No per-sample, per-facet, or per-mark offscreen surfaces.
- No mark-name, view-path, or MCCA-specific matching.
- No public `useMSAA` or renderer-specific grammar property.
- No new Core scene graph, retained layer tree, or replacement view hierarchy.
- No generalized reordering of overlapping or opacity-scoped paint commands.
- No specialized regular-grid heatmap renderer.
- No direct-to-parent resolve optimization until the structural fix is measured
  and a remaining composite pass is shown to matter.
- No changes to picking compositing; picking remains flat and single-sampled.

## Key decisions

### Existing view scopes define layers

`LayoutResult.collectRenderCommands()` already emits balanced `pushView`, mark,
and `popView` operations. The WebGPU frame compiler will annotate these flat
scope ranges during `finish()` instead of constructing a second tree.

Each completed scope records a small static classification derived from its
selected drawable descendants:

- empty;
- direct or mixed; or
- a four-sample coverage group whose drawable descendants all require coverage
  antialiasing.

Only the outermost coverage-compatible scope becomes the MSAA accumulation
group. Compatible child scopes collapse into it, except that declared local
opacity remains as a nested group so the renderer can evaluate it every frame.
Promotion stops at a direct single-sampled descendant. This classification is
structural: it does not depend on the boundary's current opacity value.

A scope is coverage-compatible exactly when every selected, non-empty drawable
descendant requires coverage antialiasing. Child viewports, scissors, and local
opacity do not change that classification. Empty scopes disappear after the
export predicate and do not block promotion. A direct single-sampled draw makes
the scope mixed and stops promotion.

Examples:

```text
cnv-segments                    RenderGroup(sampleCount: 4)
├─ CNV rects                    ordered draws
└─ LOH rects                    ordered translucent draws

sample-facets                   direct/mixed parent
├─ cnv-segments                 one MSAA leaf
└─ mutations                    direct point draws after the resolve
```

```text
transcripts                     RenderGroup(sampleCount: 1, opacity: live)
├─ exons                        nested RenderGroup(sampleCount: 4)
└─ bodies                       direct rule draws
```

The same rules apply to sample-faceted and ordinary views. Placement indices
select geometry inside a layer but never create layers themselves.

`beginSampleFacetBatch()` and `endSampleFacetBatch()` already mark a repeated
hierarchy whose placements are disjoint and may be batched by logical view or
mark. Within that explicit scope, repeated occurrences of the same semantic
container contribute to one layer in first-container paint order. Outside it,
the compiler never regroups sibling scope occurrences or changes paint order.

### Four-sample groups are maximal coverage accumulations

A `sampleCount: 4` group may contain ordered draws and nested local-opacity
groups whose descendants use the same sample count. The outer group defines a
maximal coverage-compatible accumulation. A mixed-geometry group is
single-sampled and may contain direct draws plus nested four-sample groups.

This matches WebGPU's attachment and pipeline compatibility rule while keeping
dynamic opacity in the renderer. When a nested four-sample opacity group is
currently opaque, normalization flattens it into the surrounding four-sample
accumulation. When it is fractional, the existing recursive path isolates that
subgroup and composites it into the outer target. The extra passes therefore
exist only on frames that semantically require group opacity.

The renderer remains generic. It receives a small ordered render-group tree and
does not know about GenomeSpy views, facets, samples, or mark types.

### Coverage intent stays semantic and internal

Replace the stored `{ sampleCount }` mark-intent object with one semantic
predicate such as `needsCoverageAntialiasing(mark)`. The current eligibility
remains deliberately narrow: undecorated rectangles with no visible stroke,
rounded corners, shadow, or hatch.

Core's WebGPU adapter maps an eligible leaf to `sampleCount: 4`. Canvas2D keeps
browser-managed antialiasing and ignores this quality intent. This keeps sample
count out of semantic mark state and avoids a public renderer-specific option.

If a future example needs to override automatic eligibility, add a generic
render-quality contract in a separate proposal rather than matching view names
or exposing `useMSAA`.

### Opacity is live renderer input, not a Core classification input

Core retains the structural group boundary for any view with local opacity,
including dynamic semantic-zoom and expression-driven opacity. The retained
frame plan and its MSAA classification do not change when opacity changes, so
zooming must not trigger layout or layer-plan recompilation. For each frame,
Core only reads the current local opacity and submits it on the existing group.
It does not prune or flatten the group based on that value.

Add `View.hasLocalOpacity()` as the structural source of truth. It reports
whether the view's configured `opacityFunction` differs from the identity
function, covering specification-defined opacity and intentional custom
functions such as metadata fading without evaluating the function. The frame
compiler calls this method during `finish()` and never calls `getOpacity()` for
classification.

The WebGPU renderer owns the runtime optimization:

- opacity zero: discard the complete group before recursively normalizing its
  draws or acquiring, resolving, or compositing a transient target;
- opacity one with `sampleCount: 1`: flatten the group into its parent while
  preserving item order;
- opacity one with `sampleCount: 4`: flatten into an enclosing four-sample
  accumulation when one exists; otherwise render, resolve, and composite the
  top-level MSAA group because a WebGPU resolve does not source-over blend into
  existing parent content; and
- fractional opacity: isolate the group and composite it once with the current
  opacity.

This renderer pruning concerns draw normalization and GPU work. Core's normal
per-frame view lifecycle and retained mark-resource synchronization stay
independent of opacity so a branch can become visible on the next zoom frame
without rebuilding the layout. A direct resolve into the parent remains out of
scope unless the renderer can prove that the affected parent region is empty or
fully replaced.

Existing mark-level effective-opacity culling remains allowed: Core may omit an
individual inactive draw before submission. It must still emit the structural
view group. The renderer is the only component that removes the entire group or
flattens it based on its local opacity.

### Bounds follow semantic clipping, not sample extent

Layer bounds come from the annotated view scope and existing
`getViewClipDirections()` behavior, intersected with the current render target.
Zoomable views retain the new default XY clip; explicit X-only or Y-only clips
remain unbounded in the other direction.

A layer spans the union implied by its container, not the full virtual sample
dataset and not one rectangle per sample. The transient allocator continues to
round and clip physical bounds and enforce its existing retention budget.

### Canvas opacity layers are pooled, not recreated every frame

Canvas2D does not consume MSAA intent. It continues to isolate only views whose
local opacity is between zero and one. Replace the unconditional
`document.createElement("canvas")` in every `pushView()` with a small reusable
pool owned across live frames by the Canvas coordinator or surface.

The pool is stack-oriented because simultaneous nested opacity groups need
distinct canvases. It clears and resizes acquired canvases, releases all of
them at frame completion, and retains only a bounded number/area. Export may use
an invocation-local pool. Do not add per-view retained layer identity unless
profiling proves the stack pool insufficient.

### Export compiles the same structural layers

Full raster and hybrid SVG export already compile an export-sized layout and a
fresh WebGPU frame plan against a detached target. The layer classifier runs
after applying the export mark predicate, so a selected raster run receives the
same maximal compatible layer structure for its included marks.

SVG remains responsible for run selection, crop bounds, placeholders, and
document order. WebGPU remains responsible only for transparent selective
rendering at the requested logical size and pixel ratio.

## Comparable designs

- Vega group marks use the authored group hierarchy as the container,
  coordinate, and clipping boundary instead of inferring groups from adjacent
  primitive marks. GenomeSpy should likewise use its existing view scopes:
  <https://vega.github.io/vega/docs/marks/group/>.
- The WebGPU specification requires a render pipeline's multisample count to
  match the pass attachments. Restricting four-sample groups to draw-only
  leaves makes that constraint explicit and keeps mixed containers in a
  single-sampled parent:
  <https://www.w3.org/TR/webgpu/#dictdef-gpumultisamplestate>.

No external implementation code will be copied or adapted, so no additional
license notice is required.

## Alternatives considered

### Restore pre-`965612973` occurrence batching

Rejected. It restores MCCA performance by submitting every occurrence at the
first occurrence's paint position, but can move a draw ahead of overlapping
siblings and into the wrong opacity scope.

### Commute only disjoint submitted draw bounds

Rejected. It is conservative and correct, but MCCA remained at 247 groups
because direct single-sampled draws presented 203 overlapping bounds barriers.
It also adds hot-path scanning without solving the measured problem.

### One global MSAA layer for the whole frame

Rejected. It would move direct overlays, independent opacity scopes, and
unrelated tracks across their semantic Z positions. Maximal compatible view
containers provide the useful batching without changing the authored layer
structure.

### Make every child of a mixed container multisampled

Rejected. `transcripts` demonstrates why: exons benefit from MSAA, while gene
bodies are rules and should remain on the direct path. Global four-sample
pipelines would also regress dense scatter plots.

### Add a retained Core layer tree or scene graph

Rejected. The balanced flat paint plan already contains every necessary view
boundary. Scope annotations are enough and avoid duplicating ownership,
visibility, or lifecycle state.

### Infer semantic containers in the low-level renderer

Rejected. The renderer cannot know which draws belong to `cnv-segments` or
`transcripts`; Core owns that hierarchy and must submit the intended groups
explicitly.

## Milestone 1: Compile maximal view-scoped MSAA leaves

### Intended outcome

Core submits one four-sample accumulation for each maximal coverage-compatible
view container.
MSAA group count no longer scales with sample placements, and paint order,
clipping, opacity, and picking remain correct.

### Work

- [ ] Replace the stored sample-count intent object with a semantic
      coverage-antialiasing predicate and remove redundant state from
      `MarkState`.
- [ ] Match `pushView`/`popView` ranges during frame-plan completion and fold
      selected descendant intents into compact annotations on the existing
      paint commands.
- [ ] Record and honor `beginSampleFacetBatch`/`endSampleFacetBatch`: aggregate
      repeated occurrences by logical container only inside that explicit
      batching scope; preserve strict command order everywhere else.
- [ ] Mark only outermost coverage-compatible scopes as four-sample
      accumulations. Stop promotion at direct content, but retain declared
      local-opacity scopes as nested groups regardless of their current value.
- [ ] During visible rendering, push one group at an annotated scope, append
      every descendant draw in original order, and resolve at the matching pop.
- [ ] Always submit declared opacity scopes with their current numeric value;
      do not prune, flatten, or reclassify them in Core. Keep mixed opacity
      scopes single-sampled and allow nested four-sample groups such as
      `transcripts/exons`.
- [ ] Add `View.hasLocalOpacity()` and use it, without evaluating live opacity,
      as the sole structural opacity-boundary test.
- [ ] Delete occurrence-run grouping by active mark ID and all speculative
      reordering or submitted-mark bookkeeping.
- [ ] Keep picking flat and preserve current offscreen/zero-area culling.
- [ ] Replace implementation-order tests with structural contracts for pure,
      mixed, nested, zero-opacity, clipping, and repeated-placement scopes.
- [ ] Update the Core rendering architecture and WebGPU integration README in
      the same commit.

### Affected areas and consumers

- `packages/core/src/rendering/renderingIntent.js`
- `packages/core/src/rendering/webgpu/webGpuViewRenderingContext.js`
- colocated intent and WebGPU frame tests
- Core rendering architecture documentation
- live WebGPU, picking frame generation, and detached export frame generation

WebGL is unchanged. Canvas2D consumes view opacity independently and does not
consume the coverage predicate.

### Verification

- Unit tests show that 2 and 200 placements produce the same number of MSAA
  groups for an otherwise identical container.
- A `cnv-segments`-shaped hierarchy yields one draw-only four-sample group with
  CNV before LOH and a following mutation draw outside the group.
- A `transcripts`-shaped hierarchy yields one opacity group containing a nested
  exon MSAA leaf followed by a direct rule draw.
- Nested opacity, opacity zero, explicit directional clips, offscreen views,
  `may-overlap` placements, and picking preserve their existing semantics.
- Changing semantic-zoom opacity across zero, fractional, and one does not
  rerun layout or rebuild the retained Core frame plan, and does not change its
  structural group topology.
- Existing effective-opacity culling may omit inactive mark draws, but the
  containing structural opacity group remains in Core's submitted frame.
- Generated view/layout tests use the repository `test-genomespy-views`
  workflow rather than hand-built hierarchy mocks where structure matters.
- Focused Core WebGPU tests, Core type checks, and lint pass.

### Documentation and migration

Document view-scoped layer classification and remove claims that MSAA groups
are formed from compatible draw runs. There is no public grammar migration.

Tentative commit: `refactor(core): compile MSAA from view layers`

## Milestone 2: Coalesce opaque MSAA opacity groups at render time

### Intended outcome

The low-level renderer evaluates live opacity without changing Core's retained
structure. Matching opaque four-sample children flatten into their surrounding
four-sample accumulation and resolve once. Fractional children retain the
existing isolation path.

### Work

- [ ] Pass the enclosing target sample count through `_normalizeRenderItems()`
      and flatten an opaque group only when its sample count matches that
      target.
- [ ] Retain `_renderDrawGroup()` only for mixed four-sample accumulations with
      fractional nested opacity; opaque steady-state groups bypass it.
- [ ] Keep one `_encodeMultisampleDrawPass()` path and one composite path for
      resolved groups.
- [ ] Make runtime opacity handling explicit in renderer normalization: prune
      zero before visiting children, flatten one-opacity single-sample groups,
      and composite fractional groups exactly once. Keep the resolve/composite
      path for one-opacity MSAA leaves unless parent replacement is proven.
- [ ] Preserve empty-group pruning, target intersection, scissor normalization,
      transient pooling, eviction, and deferred destruction.
- [ ] Cover direct, single-sampled nested, opaque nested four-sample, and
      fractional nested four-sample groups.
- [ ] Measure production LOC before and after; the renderer implementation
      portion of this milestone must be net-negative.

### Affected areas and consumers

- `packages/webgpu-renderer/src/index.d.ts`
- `packages/webgpu-renderer/src/renderer.js`
- renderer render-group and GPU tests
- Core WebGPU frame fixtures and mocks

The renderer package is unpublished and Core is its sole consumer, so the
contract can be tightened directly without a compatibility shim.

### Verification

- Renderer tests assert one multisample pass and one resolve/composite for a
  multi-mark coverage group whose opaque nested boundaries were flattened.
- Reusing the same structural frame with opacity values zero, fractional, and
  one respectively produces no child normalization/GPU work, one isolated
  composite, and a flattened single-sample group. A one-opacity MSAA leaf still
  resolves and composites once.
- A fractional nested four-sample group retains its independent opacity while
  opaque siblings coalesce.
- A GPU pixel test asserts the intended source-over result when a translucent
  LOH-like rectangle overlaps a CNV-like rectangle in the same multisample
  attachment before resolve.
- Existing transient texture retention, eviction, delayed destruction, nested
  opacity, and target-bound tests remain green.
- Renderer type checks and GPU tests pass.

### Documentation and migration

Update the renderer public contract and README. Remove descriptions of
renderer-side chunk inference that no longer exists.

Tentative commit: `refactor(webgpu-renderer): render explicit MSAA leaves`

## Milestone 3: Reuse Canvas2D opacity surfaces

### Intended outcome

Canvas2D retains correct SVG-style group opacity without allocating a new
offscreen canvas for every opacity group on every animation frame.

### Work

- [ ] Add the smallest stack-oriented layer-surface pool that can survive
      across live Canvas frames.
- [ ] Acquire only for opacity strictly between zero and one; skip zero-opacity
      groups and retain the direct path for opacity one.
- [ ] Clear, resize, and transform acquired contexts using existing normalized
      physical bounds, then release them at the matching `popView()`.
- [ ] Bound retained canvas count and pixel area; discard oversized or excess
      entries instead of retaining peak allocations indefinitely.
- [ ] Use an invocation-local pool for raster/SVG export if the live surface
      pool cannot be reused safely.
- [ ] Remove duplicate setup/teardown branches from the view context where the
      pool centralizes them.

### Affected areas and consumers

- Canvas2D surface/coordinator and `renderCanvas2D()` options
- `canvas2DViewRenderingContext.js`
- full raster and SVG Canvas fallback paths
- Canvas2D opacity and allocation tests

### Verification

- Pixel/command tests retain correct overlapping and nested group opacity.
- After warm-up, repeated animation frames do not call
  `document.createElement("canvas")` for stable opacity scopes.
- Retained surfaces are bounded by simultaneous nesting and the configured
  pixel budget, not by frame count or sample count.
- MCCA Canvas interaction remains responsive without renderer-process crashes
  or monotonically growing canvas allocations.
- Canvas focused tests, type checks, and lint pass.

### Documentation and migration

Update the Canvas rendering README only if ownership changes are not evident
from the code. No public behavior or schema changes.

Tentative commit: `perf(core): reuse Canvas opacity surfaces`

## Milestone 4: Preserve layers through raster and hybrid SVG export

### Intended outcome

Issue #483 remains fully satisfied after the layer cleanup: export-sized WebGPU
layouts use the same structural layers, and selective SVG raster runs retain
transparency, crop bounds, and document order.

### Work

- [ ] Ensure detached frame compilation classifies layers after applying the
      export mark predicate.
- [ ] Cover a selected single mark from a normally multi-mark MSAA container
      and a selected contiguous multi-mark run.
- [ ] Cover a mixed transcript-like opacity container with an exon MSAA leaf
      and direct body mark when the predicate selects either or both.
- [ ] Remove export fixtures and adapter branches that only supported
      occurrence-run MSAA grouping.
- [ ] Keep serialization of shared retained-resource synchronization and
      target-local globals unchanged.

### Affected areas and consumers

- Core WebGPU detached-target and raster export paths
- SVG hybrid rasterizer integration
- WebGPU surface/frame tests and structured SVG integration tests

### Verification

- Full raster export uses requested logical dimensions and pixel ratio.
- Selective rendering clears transparently and excludes unselected siblings.
- Hybrid SVG embeds correctly cropped images in original document order.
- `cnv-segments` exports CNV and LOH in one resolved layer when selected as one
  run; mutation points remain vector/direct where supported.
- Live frame state, picking, and subsequent exports remain unchanged.
- Use the repository `test-genomespy-views` workflow for structured SVG output.

### Documentation and migration

Reconcile the issue #483 behavior in the WebGPU integration README. No public
API migration is expected.

Tentative commit: `refactor(core): export view-scoped WebGPU layers`

## Review gates

### Layer-contract review after milestones 1 and 2

Review Core and renderer together. The reviewer must inspect view hierarchy,
opacity, clipping, picking, placement, renderer pass formation, and production
code size—not only the local unit-test diff. Resolve correctness and KISS
findings before committing the second milestone.

### Final integration and smell review

After milestones 3 and 4, review the complete branch for duplicate layer
models, retained-surface leaks, unnecessary abstractions, stale compatibility
paths, and tests that codify implementation details. Re-run verification after
material fixes.

## Final integration verification

### Representative browser examples

- MCCA WebGPU:
  `/?spec=private/MCCA-visualization/web/specs/spec.json&renderer=webgpu`
  - copy-number segments, metadata cells, cytobands, and exons have smooth
    edges;
  - transcript opacity transitions remain correct;
  - semantic-zoom opacity changes do not trigger layout or layer-plan
    recompilation, and zero-opacity transcript branches encode no GPU work;
  - mutations, text, rules, and gene bodies remain single-sampled;
  - zoom, pan, closeup, scrolling, hover, and picking produce no console or
    validation errors.
- GenomeSpy paper WebGPU:
  `/?spec=private/genomespy-paper-2024-spec/spec.json&renderer=webgpu`
  - one `cnv-segments` MSAA layer contains ordered CNV and LOH draws;
  - mutations render afterward on the direct path;
  - configuration visibility and closeup interactions preserve layering.
- Repeat MCCA with `renderer=canvas` for opacity, zoom, scrolling, and stable
  offscreen-canvas allocation.

### Performance gates

- MSAA group count is invariant with sample count for a fixed view hierarchy.
- Reduce the representative MCCA frame from 247 composite bindings by at least
  80%; the expected result is single digits or low double digits based on the
  semantic layer count.
- The authoritative MCCA wheel-zoom benchmark at DPR 1 returns to approximately
  16.7 ms median/p95 pacing with no intervals over 33.3 ms in the measured
  interaction window. Repeat at DPR 2 to expose attachment-area regressions.
- Command encoding and transient texture counts scale with semantic layers, not
  sample occurrences.
- Canvas creates no new opacity canvases per steady-state frame after warm-up
  and retains no unbounded peak allocation.

### Repository checks

- Focused Core WebGPU, Canvas2D, SVG, and WebGPU renderer suites.
- WebGPU renderer GPU tests.
- Full unit suite when milestone-level checks are green.
- Workspace TypeScript checks and lint.
- `git diff --stat`, focused `wc -l`, and production/test line counts after
  every milestone. The final production diff across frame/compositing paths
  should be net-negative from the starting branch; any growth requires an
  explicit correctness or lifecycle justification in this plan.

## Acceptance criteria

- `cnv-segments` forms one MSAA layer containing CNV and LOH for all samples.
- `transcripts` forms one semantic opacity layer; exons use one nested MSAA
  leaf and gene bodies remain direct single-sampled draws.
- MCCA copy-number, metadata, and cytoband containers resolve once per maximal
  compatible view layer, not once per mark occurrence or sample.
- Opacity, clipping, painter's order, nested groups, and zero-opacity pruning
  are correct without occurrence reordering.
- Repeated sample-facet hierarchy is regrouped only inside its explicit batch;
  non-batched sibling commands retain exact submission order.
- Dynamic opacity changes leave Core's compiled group topology intact; WebGPU
  renderer normalization performs zero-opacity pruning and one-opacity
  flattening on every frame.
- Dense scatter plots and picking retain the direct single-sample path.
- Canvas2D group opacity is correct and its temporary canvases are reused and
  bounded.
- WebGPU full raster and hybrid SVG export preserve dimensions, transparency,
  crop placement, selected marks, and document order.
- WebGL code and behavior are unchanged.
- Obsolete occurrence-run grouping is deleted; the mixed-sample renderer path
  remains only for fractional nested opacity.
- Final production code in the touched frame/compositing paths is smaller than
  at the start of this cleanup.
