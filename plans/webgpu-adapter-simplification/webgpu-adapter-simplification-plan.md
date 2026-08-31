# WebGPU adapter simplification plan

Status: Proposed

## Context

The selective WebGPU compositing and export work established useful low-level
capabilities, but the Core adapter retained temporary diagnostics, overlapping
placement modes, duplicated frame stacks, and mutable export state. On the
current branch (`b06c50763`), the complete branch diff against `origin/master`
is 3,526 additions and 291 deletions. A path-based count excluding tests,
documentation, examples, stories, and plans leaves approximately 1,878
additions and 250 deletions in production files, or a net increase of 1,628
lines. These counts are signals rather than targets, but they justify a
deliberately deletion-first pass.

Two recent fixes change the starting point:

- zoomable positional marks now default to semantic `xy` clipping, and
  compositing bounds preserve explicit one-axis and `"never"` behavior; and
- the low-level renderer now drops zero-opacity groups before normalizing their
  descendants.

The generic renderer `RenderGroup`, texture compositor, sample-count pipeline
variants, detached same-device targets, and flat picking path remain sound.
Plain rectangles remain eligible for MSAA regardless of faceting, including
cytobands, copy-number segments, metadata cells, and other undecorated
rectangles.

## Goals

- Delete temporary diagnostics and compatibility machinery that no longer
  serves production rendering.
- Restore ordinary draw-level placement for MSAA-eligible source-backed marks,
  preserving exact paint order, opacity scope, clipping, and x-index queries.
- Remove avoidable per-item allocations from renderer normalization.
- Make a submission's mutable frame state explicit and separate from retained
  surface resources.
- Render exports without temporarily replacing live surface state.
- Consolidate duplicated export lifecycle and color-conversion helpers.
- Prevent detached export sizes and resizes from growing retained transient GPU
  memory without bound.
- Finish with fewer production lines and fewer concepts than the current
  branch.

## Non-goals

- Changing the declarative grammar, clipping semantics, or the set of plain
  rectangles eligible for MSAA.
- Adding compositing or export behavior to the WebGL renderer.
- Replacing the retained WebGPU mark/resource model or renderer `RenderGroup`
  API.
- Building a retained Core scene graph or mirroring the complete view hierarchy
  in the renderer.
- Preserving the temporary WebGPU frame-summary API through aliases,
  deprecations, or compatibility wrappers.
- Pooling Canvas2D opacity layers in this project. Track-sized semantic clipping
  has removed the urgent memory problem; pooling adds ownership and eviction
  code and should require fresh profiling evidence.
- Broad renderer tuning unrelated to the identified normalization and transient
  attachment paths.

## Size and complexity budget

Milestones 1 through 5 must produce a net deletion in production code when
considered together. A reduction of roughly 200 production lines is a useful
target, not a reason to obscure control flow or weaken tests. Each milestone
records `git diff --numstat` or a focused `wc -l` comparison before commit.

New abstractions must replace more machinery than they introduce. Prefer a
plain record plus a few functions over a class hierarchy. Tests may grow when
they replace temporary diagnostics with durable behavioral coverage.

Milestone 6 is exempt from the deletion requirement because it closes an
unbounded GPU-memory retention risk. Its implementation must nevertheless be
small and isolated.

## Key decisions

### Keep only genuine per-instance placement

Core currently combines two cases under `instancePlacementIndexed`:

1. marks whose encoders genuinely supply a per-instance `facetIndex`; and
2. ordinary source-backed plain rectangles promoted to per-instance placement
   solely because they use MSAA.

Only the first case remains. Ordinary MSAA rectangles use one ordered draw per
visible occurrence with a draw-level placement index. Consecutive draws may
still be grouped into one MSAA render group by `WebGpuSurface`, but draws must
never be gathered from later paint commands or moved across opacity scopes.

Packed `placementIndices` are generated and uploaded only when the mark's own
encoding requires them. Ordinary source-backed marks retain their packed
occurrence ranges and x indexes. Rendering intent is derived once per prepared
mark, not once per occurrence; if intent eligibility can change with a mark
revision, the cached value follows that revision rather than becoming a new
independent invalidation system.

### Delete frame diagnostics instead of redesigning them

`WebGpuFramePlanSummary`, `directSummaryKeys`, the canvas
`data-webgpu-frame-plan` attribute, and forwarding through the coordinator,
GenomeSpy, embed API, and App were acceptance-test scaffolding. Permanent tests
can inspect submitted renderer items and visible behavior directly. No
replacement public debug API is introduced.

Performance profiler counters remain because they are backend-neutral,
allocation-conscious instrumentation used by the interaction benchmark.

### Use one explicit frame builder per submission

`WebGpuSurface` should own the canvas integration, retained renderer handles,
placement-set handles, and render targets. It should not own the mutable item
stack for whichever live or export frame happens to be under construction.

Introduce one small adapter-internal frame record/builder containing the
ordered render items, flat picking draws, group stack, current MSAA run, and
explicit target metrics. `WebGpuViewRenderingContext` replays its retained
paint commands into that builder. The builder owns opacity nesting and MSAA run
formation; the surface only resolves retained mark and placement handles and
submits completed arrays.

This keeps the retained flat paint-command stream because view opacity is live
and must be evaluated per paint. It does not introduce a second retained view
tree. The final nested `RenderItem` array is the renderer's required submission
format, not another long-lived Core representation.

Live and export builders receive `{ width, height, dpr }` explicitly. Export
must not change `WebGpuSurface.getLogicalCanvasSize()`, device pixel ratio, live
frame arrays, picking state, or an active group.

### Normalize render items with one frame-local context

The renderer creates its logical canvas rectangle and profiler phase once for
the whole frame. A single-draw normalizer accepts that shared context and
returns one normalized draw or `undefined`. Flat draw normalization and nested
render-item traversal reuse it; neither path calls `_normalizeDraws([item])`.

Zero-opacity groups continue to stop traversal before their children. Draw
validation, placement resolution, culling, uniform indices, counters, and
picking-frame ordering remain unchanged.

### Bound only free transient GPU attachments

Keep exact-size reuse. Add a small least-recently-used bound over released
attachments, constrained by both entry count and estimated sample-pixel cost.
In-use textures are never evicted. A released texture larger than the cache
budget is destroyed immediately, and eviction calls `GPUTexture.destroy()`.

Do not add power-of-two buckets or oversized texture reuse. They complicate
logical origins and composite bounds and can trade allocation churn for excess
memory. The exact entry and sample-pixel limits are implementation constants
documented next to the pool and covered by deterministic tests.

## Comparable designs and provenance

[PixiJS CanvasPool](https://pixijs.download/v8.5.2/docs/rendering.CanvasPool.html)
uses explicit acquire/return ownership for temporary canvas/context pairs. It
confirms that pooling is a viable response if Canvas allocation again becomes
material, but this plan does not copy its implementation or add a Canvas pool.
PixiJS is MIT licensed.

The [WebGPU specification](https://gpuweb.github.io/gpuweb/#texture-destruction)
provides explicit `GPUTexture.destroy()` semantics, and
[wgpu](https://github.com/gfx-rs/wgpu) distinguishes transient attachment
usage from reusable texture resources. GenomeSpy's browser renderer needs
sampled group textures, so it cannot use attachment-only transient usage; the
applicable pattern is explicit, bounded lifetime management. wgpu is dual
MIT/Apache-2.0 licensed. No external code will be copied or closely adapted,
so no source-level attribution is required.

## Milestone 1: Remove temporary frame diagnostics

### Intended outcome

The visible render path builds only renderer inputs and profiler counters. No
per-frame strings, summary objects, deduplication sets, JSON serialization, or
public forwarding remain.

### Work

- [x] Delete `#framePlanSummary`, `#directSummaryKeys`, summary typedefs, and
      all summary writes from `WebGpuSurface`.
- [x] Delete `getFramePlanSummary()` and the development canvas dataset write.
- [x] Remove `getWebGpuFramePlanSummary()` forwarding from
      `WebGpuRenderCoordinator`, `GenomeSpyBase`, `embedFactory`, App debug
      wiring, rendering-backend types, and embed API types.
- [x] Replace summary-based tests with assertions against ordered renderer
      items, group bounds, sample counts, and draw order.
- [x] Remove the diagnostic descriptions from the Core WebGPU README and
      rendering architecture document.

### Affected areas and downstream consumers

- Core WebGPU surface and coordinator
- Core embed/debug API types and App development wiring
- WebGPU adapter tests and internal architecture documentation

The debug API is explicitly developer-only and temporary. No compatibility
shim is retained.

### Verification

- `rg` finds no `WebGpuFramePlanSummary`, `getWebGpuFramePlanSummary`,
  `directSummaryKeys`, or `webgpuFramePlan` references.
- Surface tests assert the same nested renderer items without summary state.
- The MCCA WebGPU example still shows MSAA on cytobands, copy-number segments,
  and metadata cells, and retains bounded transcript/exon opacity groups.
- WebGL and Canvas2D tests remain unchanged.

### Documentation and migration

Remove internal documentation of the deleted hook. There is no user-facing
migration because the API was developer-only and never part of rendering
control.

Tentative commit: `refactor(core): remove temporary WebGPU frame diagnostics`

## Milestone 2: Restore ordered draw-level placement for MSAA

### Intended outcome

Every ordinary source-backed MSAA occurrence is submitted at its original
paint-command position and within its original opacity group. Genuine
encoder-provided per-instance placement continues to work.

### Work

- [ ] Remove `instancePlacementIndexed`, `submittedPlacementIndexed`, and the
      first-occurrence loop that submits every later occurrence.
- [ ] Keep one clearly named flag only for genuine encoder-provided
      per-instance/facet placement.
- [ ] Give ordinary source-backed rectangles a draw-level placement index and
      preserve their individual packed ranges, clips, and visibility checks.
- [ ] Generate `PackedMarkData.placementIndices` only for marks whose encoding
      consumes them; remove the ordinary-MSAA upload path and its error branch.
- [ ] Restore x-index queries for ordinary source-backed MSAA marks.
- [ ] Derive rendering intent once per prepared mark and reuse it for all of
      that mark's occurrences without adding a parallel revision graph.
- [ ] Delete tests that assert the removed alternate representation and add
      paint-order and opacity-scope regressions.

### Affected areas and downstream consumers

- `webGpuViewRenderingContext.js` and `webGpuMarkData.js`
- placement configuration in `webGpuMarkAdapter.js` if naming can be reduced
- Core WebGPU placement, clipping, x-index, picking, and MSAA tests
- Core WebGPU integration README

App sample facets remain the representative genuine per-instance placement
consumer. Ordinary repeated and sample-faceted rectangles use ordered
draw-level placement unless their own encoder requires per-instance indices.

### Verification

- An interleaved `rect A / mark B / rect A` test preserves that exact order.
- Occurrences separated by different opacity views stay in their respective
  groups.
- Per-occurrence scissor rectangles and packed ranges remain distinct while
  consecutive compatible draws still resolve through one MSAA group.
- Ordinary MSAA rectangles execute x-index queries during zoom; candidate and
  native item counters remain representative.
- Genuine `facetIndex` marks retain correct placement, picking IDs, closeup,
  scroll, filter, undo, and redo behavior.
- MCCA zooming exercises cytobands, metadata, copy-number segments, and fading
  exons without the prior scissor-range error.

### Documentation and migration

Update the placement section of the Core WebGPU README to describe only genuine
per-instance placement plus ordinary draw-level placement.

Tentative commit: `refactor(core): use draw-level placement for MSAA`

## Milestone 3: Normalize renderer items without leaf arrays

### Intended outcome

Nested render-item normalization has one frame-local setup and no temporary
single-element arrays or per-leaf profiler phases.

### Work

- [ ] Extract a single-draw normalizer that receives the shared logical canvas
      rectangle and target uniform index.
- [ ] Make `_normalizeDraws()` a thin flat-loop caller for explicit picking
      frames and public flat draw lists.
- [ ] Make `_normalizeRenderItems()` traverse groups and normalize leaf draws
      directly with the same context.
- [ ] Preserve early zero-opacity subtree removal, transparent one-sample group
      flattening, validation errors, and draw/group counters.
- [ ] Delete duplicated array filtering and canvas/profiler setup made obsolete
      by the helper.

### Affected areas and downstream consumers

- `packages/webgpu-renderer/src/renderer.js`
- renderer normalization, grouping, placement, and picking tests

There is no public API change.

### Verification

- Existing renderer unit and GPU tests pass.
- Focused tests cover invalid draws, clipped empty draws, nested and flattened
  groups, zero-opacity groups, placement indices, and stable uniform indices.
- Profiler counters report one normalization phase per frame and accurate
  normalized-draw totals.
- A small allocation-focused test or benchmark confirms that nested leaves do
  not call `_normalizeDraws()` or allocate single-element arrays.

### Documentation and migration

No public documentation change is needed.

Tentative commit: `perf(webgpu-renderer): normalize grouped draws directly`

## Milestone 4: Make frame construction explicit

### Intended outcome

One explicit per-submission frame builder owns ordered items, opacity nesting,
MSAA runs, picking draws, and target metrics. `WebGpuSurface` contains retained
resources rather than mutable frame-construction state.

### Work

- [ ] Introduce a small adapter-internal frame record/builder with explicit
      `{ width, height, dpr }`, visible items, picking draws, item stack, and
      active MSAA run.
- [ ] Move opacity-group push/pop and consecutive-MSAA grouping from surface
      fields into the builder.
- [ ] Pass the builder explicitly while replaying the retained paint-command
      stream; keep one group stack and one balance assertion.
- [ ] Reduce `WebGpuSurface.drawMark()` to retained mark/placement resolution,
      or replace it with a smaller method that prepares a renderer draw for the
      builder.
- [ ] Remove `#frameItems`, `#frameItemStack`, `#pickingDraws`,
      `#activeMsaaGroup`, `beginFrame()`, and `beginPickingFrame()` from the
      surface.
- [ ] Compile export frames against explicit target metrics and remove
      `#targetSize` plus all live-state save/swap/restore logic.
- [ ] Preserve export serialization because live and export layouts still
      synchronize shared retained mark resources.

### Affected areas and downstream consumers

- `webGpuViewRenderingContext.js`, `webGpuSurface.js`, and
  `webGpuRenderCoordinator.js`
- `webGpuRasterExport.js` and detached renderer targets
- visible rendering, picking, full raster export, and hybrid SVG export tests

The renderer `RenderFrame`/`RenderItem` contract remains unchanged. Other Core
backends do not receive the builder.

### Verification

- Live rendering and picking use distinct explicit arrays and preserve order.
- Nested opacity and consecutive/non-consecutive MSAA tests require only one
  builder stack and reject unbalanced scopes.
- Export rendering never changes live size getters, live frame identity,
  picking dirtiness, or current group state, including on thrown errors.
- Repeated SVG raster runs reuse retained resources without leaking target or
  frame state between predicates.
- Full raster export honors requested logical size and pixel ratio; hybrid SVG
  crops and document order remain correct.
- The MCCA example survives zoom, opacity transitions, sample scrolling, PNG
  export, and SVG export with both Canvas2D and WebGPU available.

### Documentation and migration

Update the Core WebGPU README's frame-flow and export sections to describe the
explicit builder and immutable live surface state.

Tentative commit: `refactor(core): build WebGPU frames explicitly`

## Milestone 5: Consolidate export lifecycle helpers

### Intended outcome

Raster and hybrid SVG exports share one target-creation, wait, and destruction
lifecycle, and live/background rendering shares one WebGPU color conversion.

### Work

- [ ] Add one small `withExportTarget` helper that creates a detached target,
      maps creation failures to `RasterizationUnavailableError`, awaits the
      provided async operation, and destroys the target in `finally`.
- [ ] Use it for full raster export and the multi-run SVG rasterization loop;
      keep one target alive for all runs in a single SVG export.
- [ ] Move WebGPU background parsing and the transparent constant into one
      adapter-local utility used by the coordinator and export path.
- [ ] Delete `renderExport`, `createTarget`, duplicated try/finally blocks, and
      duplicate `toGpuColor` implementations made obsolete by the helpers.

### Affected areas and downstream consumers

- `webGpuRasterExport.js`, `webGpuRenderCoordinator.js`, and focused tests
- PNG export and hybrid SVG raster runs

### Verification

- Success and failure tests prove exact-once target destruction.
- Creation, layout, submission, queue-wait, crop, and encoding failures all
  clean up the detached target.
- Multiple SVG runs create one target, wait after each submitted run, and keep
  run order.
- Transparent, opaque, and invalid background colors behave identically in
  live and export rendering.

### Documentation and migration

No user-facing migration is required. Keep the existing asynchronous WebGPU
export documentation.

Tentative commit: `refactor(core): consolidate WebGPU export lifecycle`

## Milestone 6: Bound transient GPU texture retention

### Intended outcome

Exact-size transient attachments are reused during stable rendering, while
resizes and varying export dimensions cannot grow the free GPU texture cache
without bound.

### Work

- [ ] Track recency and estimated sample-pixel cost only for released textures.
- [ ] Enforce small fixed entry and cost budgets after every release; destroy
      least-recently-used free textures until both budgets hold.
- [ ] Destroy an individually oversized released texture immediately.
- [ ] Preserve concurrent in-use attachments and exact key matching by width,
      height, sample count, and usage.
- [ ] Keep `destroy()` idempotent and ensure evicted entries are removed from
      every owning collection exactly once.

### Affected areas and downstream consumers

- `packages/webgpu-renderer/src/renderGroups.js`
- renderer group, detached-target, resize, and lifecycle tests

The public group API does not change.

### Verification

- Stable repeated dimensions reuse the same texture.
- More unique released sizes than the entry budget evict and destroy the oldest
  free entries.
- The cost budget independently evicts a few large textures.
- In-use nested attachments are never evicted.
- Releasing an oversized export texture does not retain it.
- Renderer destruction destroys every still-owned texture once and leaves the
  pool empty.
- Renderer unit, GPU, and MCCA interaction smoke tests show no visible change.

### Documentation and migration

Update the renderer README to say that exact-size transient attachments are
pooled within a bounded free-cache budget rather than for the renderer's whole
lifetime.

Tentative commit: `fix(webgpu-renderer): bound transient texture retention`

## Deferred finding: Canvas2D opacity-layer pooling

Canvas2D still creates a new offscreen canvas for each partially transparent
view on each paint. However, semantic clipping changed the MCCA transition from
full-surface allocations to track-sized 791 by 69 layers in the tested
viewport. A persistent pool would add ownership, reset, resizing, exception
cleanup, and eviction policy to `Canvas2DSurface` and export paths.

Do not add that machinery in this simplification project. Reconsider it in a
separate plan only if a Chrome allocation profile after milestones 1 through 6
shows Canvas object/backing-store churn remains a material frame-time or memory
cost. Any later design should be surface-owned, bounded, shared across frames,
safe for nested opacity groups, and measured against the MCCA transition.

## Alternatives considered

### Keep per-instance placement for all MSAA rectangles

Rejected. Its original one-draw benefit is gone, while it still uploads
placement indices, disables ordinary x-index queries, gathers later
occurrences early, and can violate paint order and opacity scope.

### Keep diagnostics behind development checks

Rejected. Even development-only serialization requires production state,
types, API forwarding, and branches in the render path. Durable behavioral
tests provide the required coverage with less architecture.

### Replace paint commands with a retained view tree

Rejected. It would reproduce Core's hierarchy inside the adapter and likely
increase code. A short retained command stream plus one ephemeral frame builder
is sufficient for live opacity and ordered submission.

### Combine every cleanup into one refactor

Rejected. Placement ordering and explicit export/frame state are separate risk
boundaries. Small commits make deletion and behavioral preservation easier to
review and bisect.

### Pool Canvas2D layers immediately

Deferred. It addresses allocation churn but conflicts with the primary goal of
deleting code, and the recent semantic-clipping fix materially reduced the
size of those allocations.

### Reuse oversized or bucketed GPU textures

Rejected for now. Exact-size reuse has clear coordinate semantics. A bounded
exact-size cache solves unbounded retention without introducing allocation
buckets or larger-than-needed attachments.

## Risks and mitigations

- **Placement regressions:** sample facets combine topology, packed ranges,
  placement visibility, clipping, picking, and x indexing. Preserve genuine
  `facetIndex` coverage and add interleaved order tests before deleting fields.
- **Frame-builder growth:** a builder could become another abstraction layer.
  Keep it adapter-internal and data-oriented; reject the milestone if it does
  not delete more surface/context machinery than it adds.
- **Export interference:** retained mark configuration is shared even after
  frame state becomes explicit. Preserve serialization and test restoration of
  the live layout after success and failure.
- **Normalization divergence:** flat picking and grouped visible frames must
  use the same single-draw normalizer. Do not maintain two implementations.
- **Texture eviction safety:** evict only released entries and destroy each
  texture once. Tests must distinguish free and in-use ownership.
- **Over-optimizing for line count:** readable direct control flow is more
  important than reaching the approximate deletion target.

## Review gates

### Placement contract review

After milestone 2, review Core packing, placement sources, x indexing, picking,
paint order, opacity nesting, and the App sample-facet interactions together.
Do not review only the local context diff.

### Frame and export ownership review

Review milestones 4 and 5 together after both are verified. Confirm that the
surface owns retained resources only, export cannot replace live frame state,
and the builder is smaller than the machinery it replaces.

### Final integration review

After milestone 6, review the complete branch for KISS conformance, remaining
duplicate state, production line count, renderer/Core boundary clarity, and
resource lifetime. Apply worthwhile simplifications, rerun verification, and
commit only independently meaningful fixes separately.

## Final acceptance criteria

- Milestones 1 through 5 produce a net reduction in production lines and
  concepts; the final report includes before/after counts using the same
  exclusion method as the 1,628-line baseline.
- No temporary frame-summary API, JSON canvas attribute, or render-path
  summary allocation remains.
- Ordinary source-backed MSAA rectangles use ordered draw-level placement and
  x-index queries; genuine encoded per-instance placement remains correct.
- Renderer item normalization has no per-leaf single-element array path.
- Live and export rendering use explicit independent frame state; export does
  not swap live surface fields.
- Raster and SVG exports share one cleanup lifecycle and one color parser.
- Released transient GPU textures are retained within deterministic bounds.
- The generic renderer group/compositor, detached target, flat picking model,
  and plain-rectangle MSAA eligibility remain intact.
- WebGL receives no new behavior or implementation.
- Focused package tests, full unit tests, workspace type checks, and lint pass.
- The MCCA example is exercised with Canvas2D and WebGPU through zoom,
  transcript/exon opacity transitions, sample scrolling, picking, PNG export,
  and SVG export. WebGPU shows no validation errors or out-of-range scissors;
  Canvas2D shows no return of full-surface opacity layers.
- The final branch receives one critical architecture/KISS review after all
  milestones, with downstream consumers and real interactions in scope.
