# Canvas interaction performance plan

Status: Reviewed; implementation in progress

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

| Mark | Collected rows | Rows overlapping the restored x domain |
| --- | ---: | ---: |
| Gencode exons | 290,812 | 69,895 |
| Copy ratios | 62,693 | 17,170 |

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

## Goals

- Make Canvas interaction benchmarks repeatable and attributable using the
  existing benchmark driver and private profiler.
- Avoid repeated view-hierarchy opacity evaluation within one Canvas paint.
- Honor the existing `buildIndex` contract for Canvas rectangle and point
  traversal without changing mark output or SVG behavior.
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
- Adding a comparable x-subset implementation to WebGPU without independent
  profiling evidence; its instance processing occurs on the GPU and currently
  exposes no corresponding adapter contract.

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

### Build Canvas indexes from sorted source rows, not WebGL vertices

The shared mark normalization enables `encoding.x.buildIndex` by default, and
`flowBuilder` sorts eligible zoomable field encodings before collection.
Canvas will use a backend-local index cache that outlives a paint and is keyed
by logical mark, facet-batch identity, collector `dataRevision`, and positional
encoding identity. It will use renderer-neutral raw branch accessors and the
generic binned range-index utility; it will not import WebGL's vertex index.

Queries use the live x scale domain and support x/x2 half-open interval overlap.
Eligibility fails closed unless geometry expansion can be bounded, including
minimum size, stroke, shadow, seam padding, point radius, and positional
offsets. An unbounded zoom extent, non-finite value, incompatible scale,
conditional positional accessor, unsorted batch, missing continuous scale, or
disabled `buildIndex` falls back to the complete data range.

Immediate rectangle and point visitors will accept optional start/stop bounds
and iterate the original array directly. This avoids allocating `slice()`
arrays and leaves SVG callers on their current full-array path. Exact
screen-space culling remains in the visitor as the final correctness check.

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

## Milestone 3a: Specify and test Canvas x-index eligibility

### Intended outcome

The risky parts of source-row indexing have one backend-neutral, exhaustively
tested contract before they are wired into normal Canvas and picking traversal.
This milestone intentionally does not change runtime traversal or claim a
performance gain.

### Work

- [ ] Define one helper for eligibility, index construction, candidate queries,
      and attribution counters that normal paint and picking can both call.
- [ ] Require raw source accessors, sorted finite data, a finite nonzero index
      extent, continuous compatible x/x2 scales, and stable encoding identity.
- [ ] Define conservative geometry margins for rectangle and point expansion;
      fail closed for data-dependent or otherwise unbounded expansion.
- [ ] Define a cache lifetime beyond one `renderCanvas2D()` context, keyed by
      mark, data-array identity, collector `dataRevision`, and encoding identity.
- [ ] Cover disabled indexing and every unsupported case with full-range
      fallback tests.

### Affected areas and consumers

- Backend-neutral encoder/accessor and binned-index helpers
- Focused eligibility and candidate-range unit tests

Canvas, Canvas picking, SVG, WebGL, and WebGPU traversal remain unchanged in
this foundation milestone.

### Verification

- Unit tests cover points, overlapping intervals, empty bins, pan/zoom changes,
  x2, index/locus domain-start semantics, bounded and unbounded geometry,
  facets, data-revision rebuilds, encoding changes, disabled indexing,
  non-finite values, and unsorted fallback.
- Existing renderer traversal remains unchanged.

### Documentation and migration

None until renderer integration lands.

Tentative commit: `test(core): specify Canvas x-index eligibility`

## Proposed later work: not authorized for this implementation pass

### Integrate x-indexed source ranges into Canvas

Add optional start/stop bounds to immediate rectangle and point traversal and
wire the tested candidate helper into both normal Canvas paint and software
picking. Keep one coordinator-owned cache so index construction is amortized
across frames. Report profiler counters for indexed candidates, visited rows,
indexed batches, and fallback batches. SVG continues to visit full arrays.

Before landing, verify candidate counts and cadence on the exact restored MCCA
state. The two dominant rectangle batches should fall from about 353,000 rows
toward the measured 87,000 candidates, allowing conservative margin and bin
overfetch. Add a short Canvas architecture note only when this integration
actually ships.

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

- Binned ranges deliberately overfetch. Candidate-count reduction is expected,
  but exact gains depend on domain width and interval distribution.
- Conditional x encodings and data-dependent pixel offsets must fail closed to
  full traversal; expanding eligibility prematurely risks disappearing marks.
- Index/locus domains need the same inclusive-start adjustment as WebGL.
- Normal and picking rendering must query identical candidates to prevent stale
  or missing hover targets.
- The benchmark's screenshot harness does not restore the supplied hash. Exact
  restored-state runs will use the direct profiling harness until an explicit
  state-hash benchmark option is designed and verified.
- Headless timings are diagnostic; final cadence claims should use the live
  headed Chrome run on the same viewport and DPR.

## Acceptance criteria

- Every implemented milestone has a focused commit and passing relevant tests.
- The plan records completed and deferred work accurately after implementation.
- The exact MCCA wheel and Peek interactions preserve domain, scroll, visual,
  console, and picking behavior.
- Canvas normal frames appear in benchmark profiler snapshots.
- Any implemented x-index foundation has exhaustive fallback tests but does not
  alter Canvas traversal in this pass.
- Measurements report viewport, DPR, restored domain, case, run count, and the
  distinction between live-headed cadence and headless CPU attribution.
- No retained scene graph, layer cache, point LOD, or other large architectural
  change is implemented in this branch.
