# WebGPU interaction performance plan

Status: Milestones 1–3 are complete. Milestones 4 and 5 are discarded because
the final profile does not justify closeup-specific or renderer-level cleanup.
Milestone 6 automated integration is complete; manual 60 Hz observation and
plan retirement remain.

## Context

The MCCA visualization exposes intermittent judder during the interactions that
matter most in routine use: horizontal pan and zoom, the animated transition
between the bird's-eye and closeup modes, and vertical scrolling in closeup.
The behavior is more common with the experimental WebGPU backend than with the
heavily optimized WebGL backend, even when sampled CPU profiles show individual
frames completing quickly.

The backends currently do materially different work during an interaction
frame. WebGL consumes `LayoutResult` once after layout, builds reusable normal
and picking batches, and executes those batches on subsequent frames. WebGPU
retains pipelines, buffers, and mark handles, but Core creates a fresh
`WebGpuViewRenderingContext`, collects render commands again from the already
computed `LayoutResult`, rebuilds occurrence and mark configuration objects,
diffs retained resources, normalizes draw commands, and encodes a new pass on
every paint. This command collection is currently profiled as `layoutReplay`;
it is not layout computation or view arrangement.

Normal navigation changes scale domains in principle. Closeup animation and
vertical scrolling are more involved because SampleView recomputes non-uniform
sample placements. Those placement changes are legitimate: App owns the
closeup behavior, Core publishes renderer-neutral `PlacementSource` geometry,
and each backend uploads its own representation. WebGL already updates its
facet texture every closeup scroll frame. The plan therefore keeps complete
placement-buffer updates unless measurement identifies them as a significant
cost; it does not introduce a SampleView-specific offset or transform into the
generic WebGPU renderer.

## Measured baseline

Milestone 1 was implemented in commit `53acabc6a` and run on 2026-08-24 with
hardware-backed Chromium on Apple M5 / Metal 3. The matrix covered the private
MCCA visualization and a small control, WebGL and WebGPU, DPR 1 and 2, seven
declared interaction cases, and five repetitions: 280 benchmark processes
completed without harness-level failure.

The authoritative artifacts are local and ignored:

- `output/webgpu-interaction-benchmark-mcca-awake/summary.json`
- `output/webgpu-interaction-benchmark-mcca-awake/baseline.md`

The valid recorded render samples establish the following:

- Overall profiled WebGPU/WebGL median CPU frame-time ratio was about `2.0x`
  with a bootstrap interval of approximately `1.57x` to `2.0x`.
- MCCA drag, wheel zoom, and closeup-wheel render samples put WebGPU at roughly
  `1.5x` WebGL. The small control was approximately `2.0x` to `2.33x`, showing
  a meaningful fixed WebGPU overhead in addition to workload scaling.
- Median rAF cadence stayed near 16.7 ms for both backends. This does not meet
  the CPU-efficiency goal and does not disprove intermittent perceived judder.
- In MCCA wheel zoom, representative per-frame medians were approximately
  0.63 ms for render-command replay (the profiler's `layoutReplay` phase),
  1.48 ms for mark translation, and 0.31 ms for surface rendering. Mark
  translation included about 0.73 ms of mark configuration and 0.30 ms of
  retained-resource synchronization.
- Surface subphases were much smaller: approximately 0.07 ms for draw
  normalization and 0.19 ms for command encoding in the same case. Submission
  itself was negligible on the measured CPU thread.
- A representative 278-render wheel-zoom sample accumulated about 245,778 draw
  commands, 4,291 buffer writes, and 70 MB of uploads. These are cumulative,
  not per-frame values: roughly 884 draws, 15 writes, and 0.25 MB per render.
  About 63 MB of the cumulative upload was repeated draw-global data.
- Closeup wheel samples still spent approximately 0.62 ms in render-command
  replay and 1.26 ms in mark translation, compared with roughly 0.31 ms in
  surface rendering. This supports retaining the general frame plan while
  continuing legitimate placement updates.

The run also exposed a benchmark coverage defect. The summary marked every
process passed when no browser error occurred, but WASD pan, WASD zoom, and
open-closeup samples recorded no profiled normal render frames. These cases do
not yet provide CPU or structural evidence and must not contribute to
performance conclusions. This is an input-delivery and coverage defect in the
benchmark: WASD and closeup toggling are intentionally layout-free, but they
must still change interaction state and request normal paints.

The declared scrollbar-drag case guessed a point six pixels from the full
canvas edge rather than locating SampleView's canvas-rendered vertical
scrollbar. It recorded only an on-demand picking frame. Remove this case instead
of repairing it: closeup wheel scrolling exercises the same placement, range,
scrollbar-state, and rendering updates without adding another synthetic input
path. Require the closeup-wheel case to prove that the SampleView scroll offset
changed.
Filtering or sorting followed by closeup was not exercised because selectors
were not supplied.

The correction identified three distinct causes. The harness sent keyboard
events without focusing or hovering the visualization canvas, so Core's real
keyboard dispatch guard discarded the keydown events. Horizontal WASD pan also
started at the full x-domain boundary and needed an unmeasured keyboard-zoom
setup step before `KeyD` could produce a domain change. Finally, `keyup KeyE`
intentionally closes SampleView's peek state, so closeup wheel input must be
held while `KeyE` is down and validate the observed open state rather than the
state after key release. The small control contains a SampleView instance but
does not have a scrollable closeup; its closeup cases are therefore explicitly
inapplicable.

The corrected rerun is in
`output/webgpu-interaction-benchmark-mcca-coverage-corrected/`. It covered the
four affected cases (`horizontal-wasd`, `wasd-zoom`, `open-closeup`, and
`closeup-wheel`) on both renderers, both DPR 1 and 2, and five repetitions:
160 records total, 120 passed applicable samples, 40 inapplicable control
closeup samples, and zero failures. Every passed sample captured at least 115
normal render frames. Keyboard probes observed `KeyD`, `KeyW`, or `KeyE` as
expected; scale-domain, peek-state, and SampleView scroll-offset assertions
rejected no-ops. The corrected run confirms `phaseTotals.layout === 0` for
these layout-free interactions while retaining separate `layoutReplay`
measurements for render-command collection from an existing `LayoutResult`.
The valid drag and wheel-zoom measurements from the original artifact remain
unchanged and are not reinterpreted by this affected-case rerun.

The post-Milestone-2 authoritative DPR 1 gate is in
`output/webgpu-interaction-benchmark-m2-retained-dpr1/`. It contains 80
records: 60 applicable samples passed, 20 unsupported control closeup samples
were inapplicable, and none failed. MCCA WebGPU/WebGL median CPU frame-time
ratios were `1.08x` for horizontal WASD, `1.13x` for WASD zoom, `1.07x` for
the closeup toggle, and `1.19x` for closeup wheel. All are within the run's
20% A/A bound. The small control remained `1.8x` to `2.0x`, although its
absolute median WebGPU frame time was only 0.9 to 1.0 ms, so a fixed WebGPU
cost remains visible.

The structural counters are decisive despite cross-run timing noise:
`layoutReplay`, layout computation, and stable occurrence reconstruction fell
to zero. MCCA mark-configuration time fell from about 0.65 to 0.07 ms per
render frame, and every remaining configuration miss was a real packed-data
revision; expression misses remained zero. Placement computation averaged
about 0.02 ms per MCCA render frame, with approximately 0.34 uploads and
3.2 KB uploaded per frame. It is not a useful optimization target. The largest
remaining measured WebGPU subphase was retained-resource synchronization at
about 1.64 ms per MCCA render frame and 0.46 ms for the control. Exact phase
deltas across the two runs are not interpreted because tracing mode and
machine load differed; the result is used to select the next hotspot, while
the within-run backend ratios and structural counters remain the gate.

The 50% practical-noise bound is the maximum A/A deviation and is too broad to
serve as the only regression criterion. Preserve it in reports, but evaluate
direction and success using repeated paired results, phase/counter deltas, and
the structural fast-path assertions in this plan. Do not retroactively tighten
or reinterpret the original reported interval.

## Goals

- Make MCCA pan, zoom, closeup transition, and closeup scrolling consistently
  smooth with the WebGPU backend on a 60 Hz display.
- Make steady-state WebGPU navigation no more CPU-hungry than WebGL, accounting
  for measured run-to-run noise.
- Reduce interaction frames to the state that actually changed: scale domains
  for navigation and placement geometry plus affected ranges for closeup.
- Retain frame topology and draw ordering across paints instead of repeating
  general Core-to-WebGPU translation.
- Preserve renderer modularity: App behavior stays in App, Core grammar and
  layout stay in Core, and `@genome-spy/webgpu-renderer` remains generic.
- Establish a reproducible profiling workflow that can detect regressions
  without depending only on an observer-sensitive DevTools recording.

## Non-goals

- Redesigning wheel inertia, keyboard acceleration, or other interaction feel
  unless profiling shows that they independently cause uneven domain updates.
- Moving SampleView closeup semantics or `ScaleResolution` into
  `@genome-spy/webgpu-renderer`.
- Avoiding full placement-buffer uploads speculatively. They are an intended
  retained-resource update and should be optimized only if measured.
- Adding a general scene graph, reactive dependency graph, or backend-wide
  invalidation framework.
- Reworking shaders, mark features, picking semantics, or the public mark API
  without a measured interaction-path need.
- Using a lower animation speed, clamped elapsed time, or extra easing to hide
  missed frames.

## Key decisions

### Profile the real application and preserve two measurement modes

The representative workload is
`private/MCCA-visualization/web/specs/spec.json`. Private data remains a local
benchmark fixture and must not be copied into the repository. The profiling
driver must accept an arbitrary App spec path so the committed tooling remains
generic.

Use both of the following:

- Low-overhead in-page measurements for animation-frame intervals, scoped CPU
  phase durations, operation counts, and allocation-sensitive repetition.
- Browser traces for call-stack attribution, garbage collection, GPU/compositor
  events where Chrome exposes them, and validation of the in-page results.

The low-overhead run is authoritative for perceived cadence because opening or
recording DevTools can perturb scheduling. Traces explain the measured cost but
do not replace the cadence run.

### Compile stable WebGPU work after layout

Core's WebGPU adapter should compile an adapter-owned retained frame plan when
layout, mark topology, data topology, or pipeline shape changes. It may keep
renderer handles, ordered draw descriptors, occurrence/placement bindings, and
explicit typed records for dynamic slots. Avoid retained callbacks initially:
closures over Core or App state can become an implicit second scene graph. The
plan itself must not become a second view hierarchy or renderer-owned scene
graph.

A paint has an explicit dynamic phase before submission. It calls
`onBeforeRender()` once per participating view in established order, refreshes
scale and placement revisions, and updates live opacity, scrollbar, viewport,
clip, visible-range, instance-range, mark-value, and selection state. It then
submits the retained draw order. Full render-command replay from `LayoutResult`
and mark translation remain the fallback for structural invalidation, not the
normal navigation path. Existing interaction behavior remains layout-free:
WASD navigation and closeup toggling must not call layout computation or arrange
the view hierarchy.

### Keep invalidation explicit and small

Prefer existing object identity and revision sources plus a small number of
adapter-owned dirty categories over a general dependency system. The required
categories are expected to be:

- frame topology or pipeline shape;
- mark data/series;
- scale domains and ranges;
- placement topology and geometry;
- draw viewport, clipping, visibility, and instance ranges;
- dynamic mark values and selections.

The implementation may consolidate categories when profiling and correctness
tests show that a simpler contract is sufficient.

### Keep placement generic

`PlacementSource` remains the sole App/Core-to-backend placement contract.
Closeup transitions and scrolling may replace all rectangle geometry every
frame. The renderer should reuse capacity and upload the new buffer efficiently,
but it must not know why placements changed or assume a common translation.

### Optimize measured work, not theoretical call counts

The initial profiles determine whether remaining cost is dominated by Core
translation, adapter allocation, renderer draw normalization, buffer writes,
command encoding, GPU completion, or presentation. Renderer API changes and
additional staging storage require evidence from the MCCA workload or a smaller
reproduction of the same bottleneck.

The baseline selects retained Core-to-WebGPU frame compilation as the first
optimization target. Render-command replay and mark translation/configuration
dominate the measured WebGPU excess and occur in both large and small workloads.
Optimizing retained-resource synchronization alone would leave the larger
layout and configuration cost intact. Buffer uploads, draw normalization, and
command encoding remain measured follow-up targets, but their CPU phases are
currently too small to justify preceding frame retention.

## Profiling protocol and acceptance baseline

Run WebGL and WebGPU from the same production-like build, Chromium version,
machine, hardware GPU adapter and driver, OS, viewport, device-pixel ratio,
display refresh rate, power mode, and loaded MCCA state. Record this environment
metadata with every result. Warm the visualization and stabilize lazy data
before every recorded run. Use fresh or counterbalanced browser contexts to
reduce renderer-order and cache effects. Use scripted interactions with fixed
duration and displacement, run each case at least five times, and report the
median run together with variation rather than selecting the best trace.

Hardware WebGPU is authoritative for performance. Software adapters such as
SwiftShader are useful for correctness and smoke tests but must be labeled and
must not determine CPU/GPU performance conclusions. Run the main matrix at the
reference display DPR and include at least one DPR 2 sensitivity comparison.

Profile these cases separately:

1. Horizontal click-drag pan at a stable speed.
2. Horizontal WASD pan.
3. Wheel and WASD zoom over the same interval.
4. Bird's-eye to closeup transition and the reverse transition.
5. Sustained vertical closeup wheel scrolling after the transition has settled.

For each case record, where supported:

- animation-frame interval distribution and counts above 16.7 and 33.3 ms;
- total main-thread time, instrumented GenomeSpy phase time, and available
  browser renderer-process CPU time per frame at median, p95, and p99;
- time in render-command replay (currently `layoutReplay`), mark translation,
  retained-resource synchronization, placement computation/upload, draw
  normalization, encoding, and submission;
- allocated bytes, allocation rate, and garbage-collection pauses;
- draw count, `writeBuffer` call count and bytes, placement uploads, pipeline
  creation, buffer recreation, and picking renders;
- sampled queue-completion or relevant browser GPU/compositor timing without
  awaiting the queue on every frame.

Before optimization, estimate same-backend A/A variation. Define the practical
equivalence tolerance as the larger of 5% and the pre-recorded A/A noise bound.
Report the WebGPU/WebGL CPU-time ratio with a bootstrap confidence interval;
equivalence requires its upper bound to remain within the fixed tolerance. Do
not redefine the tolerance after seeing optimized results.

The final optimized result must satisfy all of these:

- In steady pan and zoom, WebGPU median and p95 renderer CPU time are no higher
  than WebGL beyond documented measurement noise.
- No steady interaction has recurring gaps above 33.3 ms attributable to
  GenomeSpy rendering on the reference 60 Hz setup.
- A domain-only frame does not replay `LayoutResult`, repack mark data, rebuild
  mark configurations, or rebuild stable occurrence topology.
- A closeup dynamic frame may compute and upload placement geometry, scale
  ranges, scrollbar state, and affected draw state, but does not run unrelated
  mark/data translation.
- WASD navigation, closeup toggling, and closeup scrolling do not invoke layout
  computation or view arrangement; this existing design constraint is guarded
  independently from the render-command replay optimization.
- No pipeline, bind group, GPU buffer, or texture is recreated during steady
  navigation or scrolling unless a capacity or structural revision requires it.
- WebGL behavior and performance do not regress materially.
- Every benchmark interaction used for comparison proves that it changed the
  expected domain, closeup, scroll, or render state and captured a minimum
  number of normal render frames. A browser-error-free no-op is not a pass.

If platform noise prevents a strict CPU ordering, increase or repeat paired runs
and report the uncertainty while structural counters confirm that WebGPU
performs only the intended dynamic work. The original 50% maximum A/A bound
must remain visible, but an optimization does not pass merely because it falls
inside that broad tolerance. Do not declare success solely because average
frame time is below 16.7 ms.

## Milestone 1: Establish the MCCA interaction benchmark

Status: Complete in `53acabc6a` and correction commit `c7e0c61ff`; the
interaction-coverage gate is complete.

### Intended outcome

A repeatable profiling driver produces comparable WebGL and WebGPU results for
all MCCA interactions, and a concise reproducible summary records the baseline,
dominant costs, and run-to-run variability. Raw machine-specific traces and
results remain ignored local artifacts. The result must distinguish cheap
frames from intermittent stalls.

### Work

- Extend or complement the existing App WebGPU example runner with a generic
  performance mode that accepts an arbitrary spec path and renderer.
- Script deterministic interaction distances and durations. Include both real
  input paths and, where helpful, direct domain-driving runs that isolate
  rendering from input delivery.
- Add opt-in, low-overhead phase counters at the Core/WebGPU boundary and
  renderer hot path. Keep profiling hooks out of the public API and inert when
  disabled.
- Capture low-overhead cadence runs and browser traces for both renderers.
- Record the actual GPU adapter and reject software-rendered runs as the
  authoritative baseline.
- Record the baseline and identify which costs scale with marks, facets, and
  closeup sample count. Include at least one small control visualization.
- Measure placement copies separately: App fills its reusable array,
  `PlacementSource` snapshots it, renderer validation snapshots it again, and
  `queue.writeBuffer()` submits it. This measurement does not presume that the
  generic placement contract should change.
- Measure renderer `_normalizeDraws()` and `_writeDrawGlobals()` directly,
  including the effect of placement replacement invalidating retained normal
  and picking frame state.
- Turn the baseline into explicit optimization priorities. Do not select a
  renderer redesign before this evidence is available.
- Before using the harness as a regression gate, make each retained case assert
  its intended state change and normal-render coverage. Completed: the harness
  establishes the real canvas focus/hover path, verifies keyboard mapping,
  rejects no-ops, marks unsupported closeups inapplicable, requires normal
  render frames, and removes the redundant scrollbar-drag case from the
  harness and reports.
- Supply stable filter/sort controls for the private MCCA correctness run or
  keep that control explicitly unverified rather than reporting full coverage.

### Affected areas and downstream consumers

- `packages/core/scripts/` or a focused App performance harness.
- `packages/core/src/genomeSpy/renderCoordinator.js` and
  `packages/core/src/rendering/webgpu/` for opt-in phase accounting.
- `packages/webgpu-renderer/src/` for renderer counters when Core timing cannot
  separate normalization, writes, encoding, and submission.
- The private MCCA fixture is consumed locally but not modified or committed.

### Verification

- Completed the corrected affected-case rerun under WebGL and WebGPU at DPR 1
  and 2 with five repetitions on Apple M5 / Metal 3 hardware: 120 applicable
  samples passed and 40 unsupported control closeup samples were inapplicable.
- Reject a sample that captures fewer than three normal render frames or fails
  to change the expected interaction state. Focused tests cover pass, no-op
  failure, and inapplicable handling.
- Asserted that WASD, closeup toggle, and closeup wheel samples invoke neither
  layout computation nor view arrangement. The report keeps `layoutReplay`
  (render-command collection from an existing `LayoutResult`) separate from
  actual `layout` computation.
- Confirm that disabling instrumentation returns the same normal hot path and
  produces no production bundle growth beyond removable debug code.
- Repeat one case interactively to verify that scripted motion represents the
  observed judder.
- Compared repeated open/close transitions, hover and picking after motion, and
  resize as correctness controls. Filtering or sorting followed by closeup
  remains explicitly unverified because no stable selectors were supplied.
- Review gate: accept the baseline only when another developer or agent can
  reproduce the run and the report separates measurement from inference.
- Current gate: complete for Milestone 1. The original valid drag and
  wheel-zoom measurements remain available, and the corrected affected cases
  now provide state-change, render-coverage, and layout-free assertions.

### Documentation or migration

Document invocation, environment metadata, output format, and interpretation
in the profiling harness README or script help. Add only a short reference from
the renderer migration backlog; do not duplicate this plan there.

Benchmark correction commit: `c7e0c61ff`

## Milestone 2: Compile and retain the WebGPU frame plan

Status: Complete in `d1f9539d7`, `be73fc73b`, `62f725840`, and `58d54a69d`.
The authoritative DPR 1 gate passed.

### Intended outcome

WebGPU consumes `LayoutResult` and translates stable mark/draw topology only
after structural invalidation. Ordinary paints reuse an adapter-owned frame
plan while preserving paint order, picking order, facets, clipping, visibility,
and resource lifetime behavior. This targets the measured render-command replay
and mark translation/configuration phases, which are the largest removable
WebGPU CPU costs in both MCCA and the small control. The optimization removes
repeated command collection from an existing layout; it does not change when
Core computes layout or arranges views.

### Work

- Define the smallest retained plan that can replay normal and picking draws
  without reconstructing Core occurrence and configuration objects.
- Define the per-frame dynamic phase as part of the retained-plan contract.
  Specify and test `onBeforeRender()` invocation count and ordering together
  with fresh scale, placement, opacity, scrollbar, viewport, clip,
  visible-range, instance-range, mark-value, and selection state.
- Move stable occurrence grouping, packed-data lookup, definition/config shape,
  placement binding, and ordered draw construction into plan compilation.
- Preserve dynamic view hooks such as `onBeforeRender()` and identify the
  values they are allowed to update without recompiling topology.
- Add explicit structural invalidation for layout, mark/data topology,
  definition/pipeline shape, and disposal.
- Keep renderer draw normalization and command encoding unchanged initially so
  the retained Core plan's effect can be measured in isolation. Their measured
  CPU cost is much smaller than render-command replay and mark translation;
  revisit their ownership only in Milestone 5 if the post-retention profile
  justifies it.
- Keep normal and picking plans coherent without eagerly rendering the picking
  pass during navigation.

### Implementation sequence

1. Compile ordered view hooks, logical marks, occurrences, immutable layout
   options, and placement ownership once per settled layout. Share this typed
   plan between normal and picking passes while keeping live hooks, opacity,
   packed data revisions, visibility, and placement geometry fresh. This slice
   removes per-paint `LayoutResult` replay and occurrence reconstruction.
2. Retain definition and configuration shape. Replace full per-mark config
   rebuilding with direct leaf readers for scale domains/ranges, channel and
   uniform values, opacity, semantic thresholds, and selections. These readers
   are local to the cached config; they do not form a general dependency graph
   or move Core scale and selection semantics into the renderer. Key the cache
   by packed-data identity and an expression-data revision so actual series
   changes still rebuild their configuration.
3. Re-run the regression benchmark after both slices. Require zero
   `layoutReplay`, zero stable occurrence reconstruction, and zero full mark
   configuration for marks whose packed-data and expression revisions remain
   stable. Record packed-data and expression misses separately instead of
   treating necessary generated-data updates as cache failures.

### Affected areas and downstream consumers

- `packages/core/src/rendering/webgpu/webGpuRenderCoordinator.js`.
- `packages/core/src/rendering/webgpu/webGpuViewRenderingContext.js`.
- `packages/core/src/rendering/webgpu/webGpuSurface.js`.
- `packages/webgpu-renderer/src/renderer.js` and public draw/update contracts if
  the current API prevents reuse.
- All Core and App WebGPU marks, placements, picking, and disposal paths.

### Verification

- Unit tests prove repeated paints do not recollect render commands from
  `LayoutResult` or rebuild stable configurations.
- Unit tests prove dynamic hooks retain their current once-per-view ordering and
  every dynamic category remains fresh without render-command replay.
- Current structural-slice smoke result: six diagnostic headless WebGPU samples
  covering WASD, closeup toggle, and closeup wheel passed their state, normal
  frame, repeated-transition, picking, and resize checks. Their normal frames
  reported zero `layoutReplay`, zero layout, and zero `markOccurrences`.
  `markConfiguration` remained nonzero as expected and is the next slice; this
  smoke run is not an authoritative performance comparison.
- Current configuration-slice smoke result: eight diagnostic headless,
  hardware-backed WebGPU samples covering horizontal WASD, WASD zoom, closeup
  toggle, and closeup wheel at DPR 1 and 2 passed state, normal-frame,
  transition, picking, and resize checks. Normal frames retained zero
  `layoutReplay`, layout, and `markOccurrences`. A focused four-sample WASD
  rerun attributed all 121–128 per-sample configuration misses to real packed
  data revisions and none to expression revisions. Stable configs were reused;
  the remaining data-revision cost must stay distinct in the authoritative
  comparison. These headless timings are not authoritative.
- Updating retained slot snapshots in place removed per-frame snapshot-tree
  allocation. In a matching four-sample headless WASD diagnostic,
  `retainedResourceSynchronization` decreased from approximately 1.02 to
  0.80 ms per render frame on average, with all samples passing. Preserve this
  change for the authoritative matrix, but do not treat the diagnostic ratio as
  final performance evidence.
- The authoritative Apple M5 / Metal 3 DPR 1 gate completed 80 samples: 60
  passed, 20 unsupported control closeup samples were inapplicable, and none
  failed. Correctness checks for repeated closeup transitions, hover/picking,
  and resize passed. Filtering/sorting followed by closeup remains explicitly
  unverified because selectors were not supplied.
- MCCA WebGPU/WebGL median CPU ratios ranged from `1.07x` to `1.19x`, within
  the run's 20% A/A bound. The small control remained `1.8x` to `2.0x`, which
  identifies fixed retained-resource synchronization as the next candidate
  rather than invalidating the MCCA result.
- Normal WebGPU frames reported zero `layoutReplay`, layout, and
  `markOccurrences`. MCCA mark configuration averaged about 0.07 ms per render
  frame; all remaining misses were packed-data revisions and expression misses
  were zero.
- Existing WebGPU Core adapter, surface, placement, picking, and renderer tests
  remain green.
- Compare WebGL/WebGPU screenshots and picking for representative ordinary,
  repeated, faceted, clipped, conditionally visible, and empty views.
- Re-run the Milestone 1 benchmark and record allocation and CPU deltas.
- Use the DPR 1 subset for the Milestone 2 regression gate. The targeted costs
  are CPU-side and not fill-rate-bound, so repeating DPR 2 would duplicate the
  matrix without testing the working hypothesis. Keep the existing DPR 2
  baseline and restore that sensitivity run only if a later change targets
  raster, attachment, upload-volume, or other pixel-count-dependent work.
- Require domain-only benchmark frames to report zero render-command replay
  (the existing `layoutReplay` counter), zero stable occurrence reconstruction,
  and zero configuration misses for marks with unchanged packed-data and
  expression revisions. Generated axes or other marks with real packed-data
  revisions may rebuild, but their miss count and cost must be reported
  separately. Closeup frames may run their explicit dynamic phase but must not
  repeat general mark translation for stable marks. Separately require the
  existing layout-computation and arrangement counts to remain zero for WASD
  and closeup interactions.
- Compare against commit `53acabc6a` using the same hardware matrix. Preserve
  both raw baseline artifacts and the generic harness as the regression gate.
- Review gate: review the retained-plan ownership and invalidation contract
  before navigation or closeup implementation. Their profiling and fixtures may
  proceed in parallel when they do not edit the shared integration contract.

### Documentation or migration

Update the Core-WebGPU integration README and renderer README only where the
runtime ownership contract changes. Update `MIGRATION_PLAN.md` status without
copying milestone detail.

Implementation commits: `d1f9539d7`, `be73fc73b`, `62f725840`, and
`58d54a69d`

## Milestone 3: Skip unrelated retained-resource scans

Status: Complete in `42b676ce1` and `ac26e1b30`.

### Intended outcome

Horizontal pan and zoom already change scale domains without layout or frame
plan replay, and the MCCA comparison target is met. This milestone removes the
remaining fixed cost of scanning every retained mark's live slots when only a
small subset of sources changed. It is retained only if the result stays
smaller and simpler than a general dependency graph.

### Work

- Count retained-mark synchronization checks and actual slot writes separately
  before changing ownership. Confirm how many stable marks are scanned for one
  domain change in MCCA and the small control.
- Use existing Core scale domain/range notifications or a small source revision
  to mark only affected retained scale bindings dirty. Do not add a general
  reactive dependency graph.
- Keep snapshot comparison at the renderer boundary for dirty bindings and for
  dynamic values that lack an explicit revision.
- Preserve explicit dependencies such as axes, viewport-derived domains,
  semantic zoom, dynamic properties, and selections. Defer expensive secondary
  updates until navigation settles where that is already their contract.
- Do not introduce a shared renderer scale resource unless repeated writes,
  rather than repeated checks, are measured as material.
- Keep wheel, drag, and WASD paths behaviorally identical; the optimization
  begins after they update the scale domain.
- Discard this milestone if the smallest correct invalidation mechanism costs
  more code or ownership complexity than the measured sub-millisecond control
  overhead justifies.

### Affected areas and downstream consumers

- Core scale/update integration in `packages/core/src/rendering/webgpu/`.
- `packages/core/src/scales/` only if an existing revision or notification is
  insufficient.
- Renderer scale slots and resource managers if measured duplicate writes need
  a generic improvement.
- Axes, lazy viewport data, selections, and dynamic channel properties.

### Verification

- A four-sample headless diagnostic covering MCCA and the small control found
  about 92 retained-mark checks but only 10 to 11 changed marks per MCCA render
  frame. The control checked 10 marks and changed 3. MCCA performed about 19 to
  20 retained resource writes per frame; the control performed about 5 to 6.
  These timings are non-authoritative, but the counts justify investigating a
  smaller mark-level synchronization set.
- Config identity now skips the redundant series-reference traversal for
  stable marks. In a matching four-sample headless diagnostic, MCCA retained
  synchronization fell by about 21% to 23% and total mark translation by about
  10% to 12%. Control synchronization fell by about 7% to 8%. All samples and
  mutation counts remained unchanged; these timings are diagnostic rather than
  authoritative.
- A per-mark resource revision now reuses existing Core scale and parameter
  notifications, plus explicit packed-data and view-opacity checks, to bypass
  unrelated marks. In the matching diagnostic, MCCA synchronization checks
  fell from about 92 to 10–11 per frame. Synchronization time fell by about 74%
  and total mark translation by about 28% to 38%. Control checks fell from 10
  to 3; its smaller timings improved or stayed within diagnostic noise. WASD,
  closeup transition, closeup wheel, picking, and resize checks passed.
- The authoritative DPR 1 navigation gate is in
  `output/webgpu-interaction-benchmark-m3-dirty-marks-dpr1/`: all 40 samples
  passed. MCCA WebGPU/WebGL median CPU ratios were `0.71x` for horizontal WASD
  and `0.75x` for WASD zoom. The control ratios were `1.0x` and `1.25x`; the
  latter was a 0.1 ms absolute difference. The combined median ratio was
  `1.0x`, with a 20% A/A bound.
- The matching closeup gate is in
  `output/webgpu-interaction-benchmark-m3-closeup-dpr1/`: 20 applicable MCCA
  samples passed, 20 control samples were inapplicable, and none failed.
  WebGPU/WebGL ratios were `0.84x` for the transition and `1.07x` for closeup
  wheel, within its 11% A/A bound. Correctness controls for repeated
  transitions, hover/picking, and resize passed in both final gates.
- The final headed Chromium runs used an approximately 8.3 ms rAF cadence,
  indicating a 120 Hz presentation path rather than the requested 60 Hz
  display path. Their within-run CPU ratios and structural counters remain
  valid, but their cadence is not compared with the earlier 60 Hz gate. The
  earlier Milestone 2 matrix and focused closeup checks retain 60 Hz coverage.
- Focused tests assert that domain-only frames update required scale slots,
  skip unrelated retained marks, and submit retained draws without plan
  compilation or data/placement updates.
- Verify wheel, drag, WASD, animated `zoomTo`, shared scales, axes, selections,
  picking-after-navigation, and viewport-domain settling.
- Run the MCCA pan and zoom benchmark cases under both backends and enforce the
  CPU and frame-cadence acceptance criteria.

### Documentation or migration

Document any new renderer-generic shared scale/update contract. No user-facing
documentation is expected for an internal optimization.

Implementation commits: `42b676ce1` and `ac26e1b30`

## Milestone 4: Isolate closeup placement updates

Status: Discarded after the Milestone 2 benchmark. Reopen only if a later
fixture makes placement computation or upload material.

### Intended outcome

The animated closeup transition and steady vertical scrolling reuse the
retained frame plan. Frames perform the legitimate SampleView placement and
range work without layout replay or stable configuration rebuilding.

The authoritative gate measured placement computation at about 0.02 ms per
MCCA render frame and only about 3.2 KB of placement upload per frame. A
dedicated closeup path would add App-specific or revision-management complexity
without addressing the measured hotspot. Milestone 3's generic synchronization
work still applies to closeup frames.

### Work

The following work is discarded unless later profiling reopens this milestone:

- Preserve App ownership of closeup interpolation, scrolling, group ranges,
  scrollbar state, and `PlacementSource` publication.
- Synchronize placement topology and geometry revisions directly into retained
  renderer placement handles.
- Continue allowing complete rectangle-buffer replacement every frame. Confirm
  that capacity remains stable and that only geometry bytes are uploaded during
  transition and scroll.
- Update dynamic clipping, visibility, and instance ranges without recompiling
  stable mark configuration or draw topology.
- Profile placement computation separately from buffer upload. Optimize either
  only if it is a demonstrated material cost, and keep any renderer change
  generic.
- Preserve postponed picking and existing closeup hover behavior.

### Affected areas and downstream consumers

- `packages/app/src/sampleView/locationManager.js`, `sampleView.js`, and
  `sampleGroupView.js` for measurement or narrowly justified computation work.
- Core `PlacementSource` consumption and WebGPU surface synchronization.
- Renderer `PlacementSet` update and draw binding paths.
- MCCA facets, group tracks, scrollbars, clipping, visibility, and picking.

### Verification

- Tests distinguish topology replacement from geometry-only updates and prove
  that scrolling does not rebuild pipelines, marks, series, or the frame plan.
- Compare WebGL facet-texture updates with WebGPU placement-buffer updates by
  call count, bytes, CPU time, and allocation.
- Exercise both directions of the closeup transition, sustained scrolling,
  filtering/sorting followed by closeup, and picking after motion settles.
- Run the MCCA closeup benchmark cases and enforce the CPU and cadence criteria.

### Documentation or migration

Update architecture documentation only if placement ownership or revision
semantics change. Do not document SampleView behavior in the renderer package.

Tentative commit: Discarded.

## Milestone 5: Remove remaining measured renderer hot spots

Status: Discarded after the Milestone 3 gates. Navigation and closeup are at
practical CPU parity, and the remaining absolute control difference is too
small to justify renderer complexity.

### Intended outcome

After retained scale and closeup dynamic updates are in place, any remaining
WebGPU CPU excess identified by the benchmark is removed without speculative
layers.

This milestone begins after a combined review of Milestones 3 and 4. It is
divisible by measured hotspot when the affected files and resource owners do
not overlap. Each accepted change should remain independently benchmarkable and
reviewable.

### Work

The following work is discarded unless a later regression identifies a
material renderer hotspot:

- Reprofile before choosing work. Current measured follow-up candidates are
  repeated draw-global uploads, per-mark scale writes, command encoding, draw
  normalization, and placement copies. Their listed order is not a commitment;
  choose from the post-retention profile and independent ownership boundaries.
- Distinguish cumulative headline counts from per-frame cost. The baseline's
  70 MB upload was accumulated over 278 renders and was dominated by about
  0.23 MB of draw-global data per frame; do not optimize the headline total
  without measuring its CPU or queue impact after frame retention.
- Optimize draw normalization, command encoding, small buffer writes, staging,
  or allocation only where the post-Milestone-4 profile shows a material cost.
- Batch compatible writes or retain scratch storage when it reduces measured
  calls or allocation and keeps ownership local.
- Avoid public caching knobs, App-specific renderer contracts, duplicated frame
  representations, and validation removal without production-boundary evidence.
- Record discarded optimization ideas and why their measured benefit did not
  justify complexity.

### Affected areas and downstream consumers

- Only the Core adapter or renderer modules named by the post-optimization
  profile.
- All custom definitions and external renderer consumers if a public contract
  changes.

### Verification

- Add focused unit/GPU coverage for each changed resource/update contract.
- Record before/after CPU, allocation, call-count, and bundle/source-size
  deltas for each optimization.
- Retain an optimization only when it produces a meaningful measured benefit
  or a clear net simplification.

### Documentation or migration

Update renderer documentation for public contract changes and the migration
backlog for accepted or discarded work.

Tentative commit: Discarded.

## Milestone 6: Integrate, guard, and reconcile

Status: Automated integration complete. Manual 60 Hz observation and plan
retirement remain.

### Intended outcome

The optimized paths work together across WebGPU features, WebGL remains stable,
and future changes can reproduce the performance comparison without relying on
the private fixture in automated CI.

### Work

- Re-run the complete MCCA profiling matrix and publish the final comparison
  beside the baseline. Completed as two same-commit DPR 1 gates for navigation
  and closeup so unsupported control closeups remain explicit.
- Use the existing repository-owned small control for fixed-overhead
  regression coverage. A new MCCA-shaped stress fixture is discarded because
  structural unit tests cover forbidden replay and dirty-mark behavior without
  copying or approximating private data.
- Add lightweight structural regression checks for forbidden work on
  domain-only and closeup dynamic frames. Completed with retained-plan reuse,
  packed/config/resource revision, and stable-mark skip tests. Timing thresholds
  remain outside ordinary CI because the runner environment is uncontrolled.
- Reconcile every plan item as completed or discarded and update the renderer
  migration backlog before retiring this plan.

### Affected areas and downstream consumers

- WebGPU renderer, Core adapter, App SampleView, benchmark tooling, and
  repository-owned performance fixture.
- WebGL rendering and picking as the compatibility baseline.

### Verification

- Renderer type, lint, build, tree-shaking, and package-content checks passed.
  The package fixtures remain 4,930 bytes gzip for the renderer-only import and
  5,010 bytes for a custom identity mark. All 52 hardware GPU tests passed.
- All 622 focused Core WebGPU, renderer, and App SampleView tests passed. Core
  and App TypeScript checks passed.
- Compare representative WebGL/WebGPU rendering and picking at DPR 1. Add a
  higher-DPR sensitivity run only for pixel-count-dependent changes.
- Manually verify MCCA pan, zoom, both closeup transitions, vertical scrolling,
  and picking after motion on the reference 60 Hz display. Pending because the
  final headed automation presented at 120 Hz.
- Final review gate: inspect cross-milestone invalidation, disposal, picking,
  performance evidence, KISS conformance, and public API footprint.

### Documentation or migration

Update Core rendering architecture and the Core-WebGPU integration README with
the final retained-frame design. Retire the temporary plan according to the
repository workflow before merge.

Tentative commit: `test(webgpu): guard retained interaction paths`

## Subagent assignment and dependency map

- **Profiling agent (Milestone 1):** completed the benchmark driver, corrected
  interaction coverage, baseline collection, and attribution report.
- **Retained-plan owner (Milestone 2):** completed the Core/renderer lifetime
  and invalidation contract as one architectural slice.
- **Navigation owner (Milestone 3):** completed dirty-mark synchronization and
  the final navigation and closeup gates.
- **Closeup agent (Milestone 4):** not assigned; dedicated placement work was
  discarded after profiling showed immaterial cost.
- **Hotspot agents (Milestone 5):** not assigned; the final comparison did not
  justify renderer-level cleanup.
- **Integration owner (Milestone 6):** reconciles overlapping changes and runs
  the final cross-backend matrix. This should not be delegated piecemeal.

No remaining milestone should reopen the retained-plan or renderer contract
without new benchmark evidence.

## Alternatives considered

### Keep replaying `LayoutResult` and optimize individual allocations

This is a useful fallback if profiling disproves the architectural hypothesis,
but it leaves general translation on the dominant interaction path and cannot
match WebGL's compiled-batch model structurally.

### Add a SampleView scrolling offset to the renderer

Rejected. The closeup transition is non-uniform, the existing generic placement
contract already expresses it, and App-specific motion semantics do not belong
in `@genome-spy/webgpu-renderer`.

### Avoid complete placement uploads

Deferred pending evidence. WebGL performs an analogous facet-texture update,
and WebGPU reuses buffer capacity. Removing the upload is not a goal unless its
measured cost is material.

### Clamp keyboard or animation elapsed time

Rejected as a performance fix. It can hide a delayed frame by reducing visible
motion, but changes interaction speed and does not remove the stall.

### Introduce a general scene graph or reactive dirty graph

Rejected. A compact adapter-owned frame plan with explicit revisions provides
the required retention without a second hierarchy or speculative framework.

### Retain arbitrary Core update callbacks

Deferred. Explicit dynamic records and slots make ownership and invalidation
auditable. Closures that capture Core or App state risk becoming an implicit
scene graph and should be introduced only for a concrete simplification.

## Risks

- A retained draw plan can become stale when dynamic visibility, clipping,
  selection, data, or placement topology changes. Structural tests must cover
  every invalidation category.
- Normal and picking plans can diverge if one is updated lazily. They must share
  topology ownership while retaining on-demand picking execution.
- Profiling hooks can distort the hot path. Counters must be opt-in and the
  cadence result must be reproduced without tracing.
- Chrome may not expose reliable GPU timing for every machine. Queue completion
  is supporting evidence, not a per-frame synchronization mechanism.
- Sharing scale resources across marks could complicate bind-group and lifetime
  ownership. It remains conditional on measured duplicate-update cost.
- Optimizing only the MCCA shape could regress smaller or external renderer
  consumers. The final control fixture and renderer-generic tests are required.

## Unresolved questions

- Which existing revision or identity signals are sufficient for dynamic scale
  values, selections, visibility, viewport, and clipping, and which need a new
  adapter-owned revision?
- Can normal and picking draws share one retained topology with separate
  dynamic state, or is a small paired-plan representation clearer?
- Does the currently small draw-normalization phase remain material after Core
  frame retention, and if so, should normalized draws be retained by Core's
  surface or by the renderer?
- Are repeated per-mark scale buffer writes material in MCCA, or is a shared
  scale resource unnecessary complexity? The wheel-zoom baseline observed about
  15 writes per render, but did not isolate their CPU/queue cost.
- Which browser trace or WebGPU timing signals are sufficiently portable for
  the benchmark report?
