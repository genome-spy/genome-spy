# Canvas interaction performance plan

Status: Milestones 1–5 complete

## Context

The Canvas2D compatibility renderer replays the complete `LayoutResult` and
clears and repaints the full surface for every interaction frame. The immediate
rendering path projects and culls source data on the CPU. Unlike WebGL, it does
not use the normalized `buildIndex` contract to narrow x-sorted data to the
current genomic domain before projection.

Profiling the private MCCA visualization at the shared state in the reported
pathological URL identified two regimes:

- At the restored chr4–chr10 domain, Canvas rendering consumed 64% of sampled
  wheel-zoom CPU time. Rectangle rendering consumed 50%, and
  `visitRectInstances` consumed 46%. Native `fillRect` accounted for only 12%,
  showing that CPU projection and culling are the primary cost.
- At the full-genome domain, point rendering consumed 64% of sampled CPU time.
  The trace contained about 106,000 `arc`, `fill`, and `stroke` calls per paint.
  This is a distinct draw-call batching problem and carries greater visual
  correctness risk.

The two dominant x-indexable rectangle marks already satisfy the shared
contract:

| Mark          | Collected rows | Rows overlapping the restored x domain |
| ------------- | -------------: | -------------------------------------: |
| Gencode exons |        290,812 |                                 69,895 |
| Copy ratios   |         62,693 |                                 17,170 |

Canvas therefore scans about 353,000 rows to find 87,000 x candidates per
paint. A temporary filtered-data counterfactual reduced steady live-Chrome
paint tasks from roughly 200–238 ms to 160–173 ms. This is attribution
evidence, not an implementation result: the production implementation must
retain conservative interval, offset, pan, and facet semantics.

The existing generic interaction benchmark already covers `wheel-zoom`,
`open-closeup`, and `closeup-wheel`, but its renderer matrix, environment
reporting, and comparison report assume WebGL and WebGPU. The private
performance profiler records Canvas picking frames but does not record normal
Canvas paints.

Peek exposes a separate, simpler source of wasted work. `SampleView` records
the repeated sample hierarchy for every sample and supplies each occurrence
with `sampleFacetRenderingOptions`. WebGL already rejects occurrences whose
normalized sample interval is wholly outside the view before issuing a draw.
Canvas and Canvas software picking do not perform that occurrence-level test;
they enter mark setup, resolve the sample's collector batch, project every
datum, and only then reject individual geometry against the clip. The main
MCCA exon and copy-ratio paths use these explicit sample facet batches, not the
placement-driven `facetIndex` grouping path.

## Goals

- Make Canvas interaction benchmarks repeatable and attributable using the
  existing benchmark driver and private profiler.
- Avoid repeated view-hierarchy opacity evaluation within one Canvas paint.
- Reduce invariant style and geometry work in the immediate rectangle hot loop.
- Skip offscreen repeated sample facets before Canvas mark traversal.
- Reuse materialized sample-facet coordinates across immediate marks without
  allocating rectangles in the per-mark traversal.
- Provide profiling evidence and requirements for the renderer-neutral x-index
  work tracked in `plans/x-indexing/x-indexing-plan.md`.
- Preserve exact painter order, clipping, opacity, interval overlap, offset,
  semantic zoom, facet, and picking behavior.
- Land each implemented milestone as a focused Conventional Commit with before
  and after measurements on the pathological MCCA URL.

## Non-goals

- A retained Canvas scene graph, dirty-region renderer, multi-canvas layer
  architecture, or worker-owned `OffscreenCanvas`.
- Peek row/tile caching or partial blits.
- Point-path batching, subpixel point approximation, or any visual LOD change.
- Changing the public grammar or the default meaning of `buildIndex`.
- Making SVG export use an interaction-oriented subset index.
- Adding a shared low-level renderer abstraction or importing WebGL modules
  into Canvas or the immediate renderer.
- Changing SampleView layout recording, sample placement topology, or SVG
  export occurrence selection.

## Key decisions

### Extend the existing interaction benchmark instead of creating a parallel one

The current benchmark already owns the interaction cases, validation, cadence,
long-task capture, raw Chromium traces, and profiler snapshots needed here. It
will accept Canvas as a renderer and make environment/report logic explicit for
GPU and CPU backends. Normal Canvas paints will call the same private profiler
frame API used by WebGL and WebGPU.

The benchmark remains diagnostic infrastructure. Draw-call monkey patches are
not part of authoritative cadence runs because wrapping native Canvas methods
adds measurable overhead. Canvas runs are CPU-renderer measurements and do not
inherit the benchmark's hardware-GPU or software-adapter classification.

### Cache effective opacity for one immediate paint

`Canvas2DViewRenderingContext.renderMark()` currently calls
`getEffectiveOpacity()` more than once per render command. The method recursively
evaluates the view ancestry, and repeated sample/facet occurrences amplify the
cost. A per-context `WeakMap` will evaluate each unit view once during a paint.
The context is recreated for every live paint and detached export, so no cache
invalidation protocol is needed and expression-backed opacity remains live
between frames.

### Treat x indexing as a cross-renderer Core contract

The original Canvas-only index proposal exposed representation and ownership
questions shared by WebGL and the Core WebGPU adapter. The replacement design
is tracked in `plans/x-indexing/x-indexing-plan.md`. It maps source x/x2
intervals to renderer-native contiguous ranges while keeping caches and
resources adapter-owned. This Canvas plan retains only the profiling evidence
that motivates the shared work.

### Share the existing sample-facet visibility contract

The normalized interval test in WebGL's `prepareSampleFacetRendering()` is the
established Core behavior: an occurrence is visible when its sample interval
overlaps `[0, 1]`. A backend-neutral immediate-rendering helper will own that
exact test. WebGL will call the helper without changing its draw behavior, and
Canvas normal and software-picking contexts will call it before clip, data, or
renderer setup. Normal Canvas keeps immediate rendering revision initialization
before the cull so an initially offscreen mark still subscribes to expression,
selection, and scale changes that request a future paint. Software picking does
not own those subscriptions.

Canvas applies the helper only to explicit `sampleFacetRenderingOptions`
without a `facetIndex` encoder. Mixed explicit-sample and placement-texture
mode therefore falls back to the full traversal, matching WebGL's separation
between uniform sample facets and `SAMPLE_FACET_TEXTURE`. Generic
placement-driven `facetIndex` marks retain their current behavior. SVG export
also retains every recorded occurrence because interaction viewport culling is
not part of structured export selection.

## Alternatives considered

### Filter or slice arrays before calling immediate renderers

Rejected because it allocates a candidate array per batch and paint. Passing
integer bounds keeps the hot path allocation-free and preserves datum identity.

### Reuse WebGL's vertex-range index directly

Rejected because the WebGL directory is an explicit deletion boundary and its
index addresses emitted vertices rather than source rows. Canvas can reuse the
generic binned-index algorithm without crossing backend ownership.

### Cache the entire rendered surface or static layers first

Deferred. Static sidebar/layer caching could provide substantial gains, but it
requires invalidation ownership across parameters, scale domains, data
revisions, layout, and paint order. The indexed traversal and per-frame cache
have existing contracts and materially lower correctness risk.

### Batch dense point paths first

Deferred. It has high full-domain potential, but grouping paths can change
alpha accumulation, overlap, painter order, and stroke joins. It needs a
separate visual design and structured rendering verification.

### Cache `facetIndex` grouping before culling sample facets

Deferred because tracing the MCCA hierarchy showed that the dominant sample
marks receive already-separated collector batches through
`sampleFacetRenderingOptions`. `groupDataByFacetIndex()` accounts for only
about 1–1.5% of sampled CPU in the current traces and serves a different
placement-driven path. Caching it would add data-revision and encoder-revision
invalidation without removing the dominant closeup traversal.

## Milestone 1: Measure normal Canvas interaction frames

### Intended outcome

The existing interaction benchmark can run Canvas cases and reports normal
Canvas frame durations and phases rather than an empty frame list.

### Work

- [x] Wrap normal `Canvas2DRenderCoordinator.renderAll()` paints with the
      private profiler's `beginFrame("canvas")` / `endFrame()` lifecycle.
- [x] Record the full Canvas paint as the `render` phase while keeping profiler
      timing overhead absent when profiling is disabled.
- [x] Add Canvas to the benchmark renderer parser, types, help, environment
      metadata, renderer ordering, and report paths without treating it as a
      WebGL adapter.
- [x] Make antialiasing noise estimation follow the selected renderer matrix.
- [x] Classify Canvas runs as CPU-renderer measurements rather than requiring
      hardware-backed GPU metadata.
- [x] Preserve the current WebGL/WebGPU comparison when both are requested and
      make Canvas-only reports meaningful.
- [x] Cover profiler lifecycle and Canvas argument parsing with focused tests.

### Affected areas and consumers

- `packages/core/src/rendering/canvas2d/canvas2DRenderCoordinator.js`
- Canvas coordinator tests and the private performance profiler
- `packages/core/scripts/runWebGpuInteractionBenchmark.mjs` and its tests

No runtime behavior changes when profiling is disabled. Other backends keep
their existing profiler phases and report semantics.

### Verification

- Focused Vitest tests for the coordinator and benchmark parser/report helpers.
- One Canvas `wheel-zoom`, `open-closeup`, and `closeup-wheel` benchmark run on
  the private MCCA spec at DPR 2, plus exact restored-state direct profiling.
- The benchmark records normal Canvas frames, changes the genomic domain for
  wheel zoom, reaches Peek state for closeup cases, and performs no layout
  during steady interactions.

### Documentation and migration

Internal benchmark help text only; no user-facing documentation or migration.

Tentative commit: `perf(core): benchmark Canvas interaction frames`

### Result

Focused tests pass. A headed 1200 x 700, DPR 2 MCCA benchmark captured 140
normal wheel frames, 38 normal Peek-transition frames, and 161 normal
closeup-wheel frames. All three interactions passed state and layout checks;
the report classified the completed Canvas-only run as authoritative. This
milestone adds measurement coverage and intentionally claims no render-time
gain.

## Milestone 2: Cache effective opacity within a Canvas paint

### Intended outcome

Repeated occurrences of one unit view evaluate its effective opacity once per
paint while preserving expression updates between paints.

### Work

- [x] Add a per-context `WeakMap` keyed by unit view.
- [x] Use the cached value for both the visibility guard and renderer options.
- [x] Add representative repeated-occurrence and next-paint invalidation tests.

### Affected areas and consumers

- `Canvas2DViewRenderingContext`
- Live Canvas rendering, detached raster export, and Canvas-backed SVG runs

SVG's native structured renderer and GPU backends are unchanged.

### Verification

- Focused Canvas context tests prove one opacity evaluation per unit view and
  fresh evaluation in a new context.
- Canvas rendering tests remain pixel/command compatible.
- Repeat the exact MCCA cases and compare profiler phase and cadence summaries.

### Documentation and migration

None.

Tentative commit: `perf(core): cache Canvas view opacity per paint`

### Result

The repeated-sample test reduces effective-opacity evaluation from once per
occurrence to once per unit view and confirms that a new paint reevaluates it.
On one exact restored-state headless diagnostic trace at 1200 x 700, DPR 2,
`getEffectiveOpacity()` fell from 10.4% of sampled wheel CPU to below the top 30
inclusive stacks. Sampled wheel-render CPU fell from about 1,214 ms to 1,035 ms
(15%), while rAF p95 fell from 50.3 ms to 43.6 ms (13%). The single-run cadence
comparison is directional; the removed call-tree cost is the stronger
attribution evidence. Peek-open p95 was effectively unchanged (41.6 ms to
41.3 ms), and closeup-wheel p95 changed from 33.3 ms to 33.1 ms.

## Milestone 3: Hoist invariant rectangle work

### Intended outcome

Rectangle traversal evaluates datum-independent paint encoders and geometry
padding once per occurrence and avoids corner-radius clamping for ordinary
square rectangles.

### Work

- [x] Evaluate constant fill, stroke, and stroke-opacity encoders once per
      rectangle occurrence and hoist constant-channel checks out of the loop.
- [x] Skip stroke-opacity evaluation when a constant stroke is absent.
- [x] Compute shadow culling padding once outside the datum loop.
- [x] Skip corner-radius clamping when all resolved radii are zero.
- [x] Extend constant-encoder call-count coverage while preserving rounded,
      square, culling, SVG, and software-picking behavior.

### Affected areas and consumers

- Shared immediate rectangle traversal used by Canvas, SVG, and Canvas software
  picking
- Canvas rectangle painting

The optimization changes neither renderer selection nor visible geometry.

### Verification

- All 52 Canvas rendering tests and all 101 SVG rendering tests pass.
- The Core TypeScript check passes.
- Exact restored-state MCCA wheel, Peek-open, and closeup-wheel profiling uses
  the same 1200 x 700 viewport, DPR 2, state hash, and trace categories.

### Documentation and migration

None.

Tentative commit: `perf(core): hoist invariant rectangle work`

### Result

A same-environment headless A/B/A comparison reduced sampled inclusive
rectangle-renderer CPU by about 3.2% for Peek-open, 4.1% for wheel zoom, and
5.4% for closeup-wheel. Total Canvas render CPU changed by about +1.5%, -3.2%,
and -1.1%, respectively, so whole-frame improvement is not consistently above
run variance. Cadence was likewise noisy and showed no defensible improvement.
The milestone is retained as a small, covered reduction in the measured hot
rectangle path rather than as a frame-rate claim.

## Milestone 4: Cull offscreen Canvas sample facets

### Intended outcome

Canvas normal and software-picking paints skip repeated sample occurrences
whose normalized vertical interval is wholly outside the view, matching the
existing WebGL behavior before any mark data is traversed.

### Work

- [x] Extract WebGL's normalized sample-facet visibility test into the
      backend-neutral immediate-rendering layer.
- [x] Preserve WebGL's current boundary behavior through focused helper and
      WebGL tests, including exact edge contact, partial overlap, wholly
      offscreen intervals, and current non-finite behavior.
- [x] Reject offscreen sample occurrences at the start of Canvas normal and
      software-picking `renderMark()` after revision-listener initialization.
- [x] Record profiler counts for considered and culled Canvas sample-mark
      occurrences without allocating or performing timing work when profiling
      is disabled.
- [x] Cover normal rendering and picking with offscreen, partially visible,
      mixed-mode fallback, and ordinary non-sample occurrences.
- [x] Prove that an initially offscreen conditional mark still schedules a
      repaint when its selection or parameter changes.
- [x] Prove that SVG retains an offscreen sample occurrence.

### Affected areas and consumers

- Shared immediate sample-facet visibility helper
- WebGL sample-facet draw preparation
- Canvas normal rendering and software picking

SVG, layout recording, placement topology, collector batches, and mark
geometry visitors remain unchanged.

### Verification

- Focused helper, WebGL, Canvas, and software-picking tests.
- Complete Canvas rendering suite and Core TypeScript check.
- Exact restored-state MCCA `wheel-zoom`, `open-closeup`, and `closeup-wheel`
  traces at 1200 x 700 and DPR 2, with a fresh pre-change run and at least two
  post-change runs in the same environment.
- Compare Canvas render CPU, `visitRectInstances`, closeup cadence, and the new
  considered/culled occurrence counters. Treat cadence as diagnostic unless
  repeated headed runs agree.

### Documentation and migration

None. This aligns Canvas with an existing internal WebGL culling contract.

Tentative commit: `perf(core): cull offscreen Canvas sample facets`

### Result

The facet-only design received a Luna review before implementation. The review
identified revision-listener initialization, mixed explicit/texture facet
mode, exact boundary behavior, and SVG export as required compatibility cases;
all are covered by the implementation and focused tests.

A fresh pre-change trace and two post-change traces used the exact restored MCCA
state at 1200 x 700 and DPR 2 in the same headless Chromium environment. During
steady closeup wheel interaction, the profiler counted 27,730 Canvas sample-mark
occurrences and rejected 26,484 (95.5%) before data traversal. Inclusive
`renderCanvas2D` CPU fell from 814.1 ms before the change to 614.4 and 611.9 ms
after it, a median reduction of 24.7%. Inclusive `visitRectInstances` CPU fell
from 530.1 ms to 306.0 and 300.4 ms, a median reduction of 42.8%.

Closeup rAF p95 fell from 26.5 ms to 18.2 and 17.1 ms, and frames over 33.3 ms
fell from two to zero. The transition case improved more modestly:
`renderCanvas2D` fell from 987.3 ms to 941.3 and 916.5 ms, while rAF p95 fell
from 34.8 ms to 33.2 and 33.0 ms. Normal wheel zoom counted 17,700 considered
sample occurrences and rejected none; its 43.2 ms pre-change p95 and 42.7/43.3
ms post-change p95 values are effectively unchanged, as expected. These cadence
numbers remain diagnostic because the controlled A/B runs were headless; the
CPU stacks and occurrence counters provide the attribution evidence.

## Milestone 5: Reuse immediate sample-facet coordinates

### Intended outcome

Canvas, SVG, and software picking materialize one sample-coordinate rectangle
per rendering context and reuse it synchronously. Parent rectangle dimensions
are read once for consecutive sample occurrences that share the same view
coordinates, and no rectangle, callback, or intermediate placement object is
allocated while resolving each occurrence.

### Work

- [x] Replace per-occurrence `Rectangle.modify()` calls with a reusable
      backend-neutral coordinate resolver.
- [x] Cache materialized parent coordinates independently from changing sample
      locations and sizes.
- [x] Preserve mutable sample-location updates within a rendering pass.
- [x] Resolve placement-source rectangles directly from their packed snapshot
      without allocating an intermediate `LocSize` object.
- [x] Make the synchronous, non-retaining visitor contract explicit.
- [x] Share the resolver across Canvas, Canvas software picking, and SVG.

### Affected areas and consumers

- Shared immediate mark occurrence traversal
- Canvas normal rendering and software picking
- Structured SVG rendering and its instance-counting pass

WebGL and WebGPU do not use the immediate coordinate resolver and remain
unchanged.

### Verification

- Focused tests prove rectangle identity reuse, one-time parent-coordinate
  reads, mutable sample-location updates, and explicit/placement transitions.
- Complete immediate, Canvas, and SVG suites and the Core TypeScript check.
- Two exact restored-state MCCA profiles at 1200 x 700 and DPR 2.

### Documentation and migration

None. This is an internal immediate-rendering optimization.

Tentative commit: `perf(core): reuse sample facet coordinates`

### Result

All 181 immediate, Canvas, and SVG tests pass, as does the Core TypeScript
check. In both post-change CPU traces, `getSampleFacetCoords()`,
`Rectangle.modify()`, its generated coordinate callbacks, and the nested
rectangle getter disappeared from the top sampled stacks. The replacement
resolver was also below the top 30 functions after parent-coordinate caching.

Against the preceding exact-state trace, the median of two post-change traces
changed inclusive `renderCanvas2D` CPU by about -1.0% for normal wheel zoom,
-3.7% for Peek-open, and -8.7% for closeup-wheel. Normal-view cadence remained
effectively unchanged. Closeup p95 remained in the same 16.9–17.4 ms range,
while profiler render time per closeup frame fell from 13.8 ms to 11.5–11.7 ms.
The supplied DevTools profile attributed 7.6% of total CPU to the removed
coordinate helper before this milestone; the controlled traces confirm removal
of that stack, while whole-frame cadence remains subject to normal headless
variance.

## Proposed later work: not authorized for this implementation pass

### Dense point batching or subpixel LOD

Investigate style-stable path batching and a device-pixel fast path. Require
structured visual comparisons for opacity accumulation, overlap order, and
stroke semantics before selecting a design.

### Static layer and Peek row caching

Investigate offscreen caching for x-independent sidebars, legends, and axes,
then row/tile caching for Peek scrolling. Define invalidation from layout,
scale, data, parameter, and placement revisions before implementation.

### Canvas-specific paint budgeting

Only after the preceding work is measured, consider adaptive interaction
quality or frame-budget policies. Do not hide avoidable CPU work by merely
dropping interaction frames.

## Risks and unresolved questions

- Shared x-index eligibility, overfetch, invalidation, geometry, and picking
  risks are tracked in `plans/x-indexing/x-indexing-plan.md`.
- The benchmark's screenshot harness does not restore the supplied hash. Exact
  restored-state runs will use the direct profiling harness until an explicit
  state-hash benchmark option is designed and verified.
- Headless timings are diagnostic; final cadence claims should use the live
  headed Chrome run on the same viewport and DPR.
- The normalized interval test intentionally matches WebGL rather than adding
  mark-specific overflow margins. Any future change to sample-facet overflow
  semantics must update both backends and their shared helper.

## Acceptance criteria

- Every implemented milestone has a focused commit and passing relevant tests.
- The plan records completed and deferred work accurately after implementation.
- The exact MCCA wheel and Peek interactions preserve domain, scroll, visual,
  console, and picking behavior.
- Canvas normal frames appear in benchmark profiler snapshots.
- Canvas explicit sample batches and WebGL uniform sample facets use one
  visibility predicate; mixed placement-texture mode falls back, while SVG
  keeps full export occurrence selection.
- Measurements report viewport, DPR, restored domain, case, run count, and the
  distinction between live-headed cadence and headless CPU attribution.
- No retained scene graph, layer cache, point LOD, or other large architectural
  change is implemented in this branch.
