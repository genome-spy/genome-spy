# WebGPU interaction performance plan

Status: Active. Milestone 1 tooling is implemented; interaction-coverage fixes
are required before Milestone 2 optimization begins.

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
optimization target. Layout replay and mark translation/configuration dominate
the measured WebGPU excess and occur in both large and small workloads.
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

Status: Implemented in `53acabc6a`; interaction-coverage acceptance is
incomplete.

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
  its intended state change and normal-render coverage. Fix focus, hover, and
  closeup targeting for the currently empty/no-op WASD and open-closeup
  samples. Make closeup wheel assert a changed SampleView scroll offset, and
  remove the redundant scrollbar-drag case from the harness and reports.
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

- Run every scripted case under WebGL and WebGPU at least five times.
- Reject a sample that captures no normal render frames or fails to change the
  expected interaction state.
- Assert that WASD, closeup toggle, and closeup wheel samples invoke neither
  layout computation nor view arrangement.
- Confirm that disabling instrumentation returns the same normal hot path and
  produces no production bundle growth beyond removable debug code.
- Repeat one case interactively to verify that scripted motion represents the
  observed judder.
- Compare repeated open/close transitions, hover and picking after motion, and
  filtering or sorting followed by closeup. Include resize as a correctness
  control rather than mixing it into steady-state timing.
- Review gate: accept the baseline only when another developer or agent can
  reproduce the run and the report separates measurement from inference.
- Current gate: the drag, wheel-zoom, and closeup-wheel measurements may guide
  Milestone 2, but the benchmark does not become the complete regression gate
  until the no-op cases above are corrected and rerun.

### Documentation or migration

Document invocation, environment metadata, output format, and interpretation
in the profiling harness README or script help. Add only a short reference from
the renderer migration backlog; do not duplicate this plan there.

Tentative commit: `perf(webgpu): establish MCCA interaction benchmarks`

## Milestone 2: Compile and retain the WebGPU frame plan

Status: Next and highest priority. Do not begin implementation until the
Milestone 1 interaction-coverage assertions are in place.

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
- Existing WebGPU Core adapter, surface, placement, picking, and renderer tests
  remain green.
- Compare WebGL/WebGPU screenshots and picking for representative ordinary,
  repeated, faceted, clipped, conditionally visible, and empty views.
- Re-run the Milestone 1 benchmark and record allocation and CPU deltas.
- Require domain-only benchmark frames to report zero render-command replay
  (the existing `layoutReplay` counter), zero mark configuration, and zero
  stable occurrence reconstruction after plan compilation. Closeup frames may
  run their explicit dynamic phase but must not repeat general mark translation.
  Separately require the existing layout-computation and arrangement counts to
  remain zero for WASD and closeup interactions.
- Compare against commit `53acabc6a` using the same hardware matrix. Preserve
  both raw baseline artifacts and the generic harness as the regression gate.
- Review gate: review the retained-plan ownership and invalidation contract
  before navigation or closeup implementation. Their profiling and fixtures may
  proceed in parallel when they do not edit the shared integration contract.

### Documentation or migration

Update the Core-WebGPU integration README and renderer README only where the
runtime ownership contract changes. Update `MIGRATION_PLAN.md` status without
copying milestone detail.

Tentative commit: `refactor(webgpu): retain compiled frame plans`

## Milestone 3: Make pan and zoom domain-only updates

Status: Pending Milestone 2.

### Intended outcome

Horizontal pan and zoom update only affected scale state and dynamic draw state
before submitting the retained frame. WebGPU navigation CPU usage meets the
WebGL comparison target.

### Work

- Bind retained mark scale slots to their Core scale sources without rerunning
  general mark translation.
- Use scale identity, revision, or small value snapshots to skip unchanged
  domain and range writes.
- Preserve explicit dependencies such as axes, viewport-derived domains,
  semantic zoom, dynamic properties, and selections. Defer expensive secondary
  updates until navigation settles where that is already their contract.
- Measure whether the same shared Core resolution causing repeated per-mark GPU
  writes is material. Introduce a generic shared renderer scale resource only
  if the profile justifies its API and lifetime complexity.
- Keep wheel, drag, and WASD paths behaviorally identical; the optimization
  begins after they update the scale domain.

### Affected areas and downstream consumers

- Core scale/update integration in `packages/core/src/rendering/webgpu/`.
- `packages/core/src/scales/` only if an existing revision or notification is
  insufficient.
- Renderer scale slots and resource managers if measured duplicate writes need
  a generic improvement.
- Axes, lazy viewport data, selections, and dynamic channel properties.

### Verification

- Focused tests assert that domain-only frames update required scale slots and
  submit retained draws without plan compilation or data/placement updates.
- Verify wheel, drag, WASD, animated `zoomTo`, shared scales, axes, selections,
  picking-after-navigation, and viewport-domain settling.
- Run the MCCA pan and zoom benchmark cases under both backends and enforce the
  CPU and frame-cadence acceptance criteria.

### Documentation or migration

Document any new renderer-generic shared scale/update contract. No user-facing
documentation is expected for an internal optimization.

Tentative commit: `perf(webgpu): make navigation update scale state only`

## Milestone 4: Isolate closeup placement updates

Status: Pending Milestone 3 by default.

### Intended outcome

The animated closeup transition and steady vertical scrolling reuse the
retained frame plan. Frames perform the legitimate SampleView placement and
range work without unrelated mark translation or resource recreation.

This milestone follows Milestone 3 by default because both paths touch dynamic
state synchronization, coordinator/surface behavior, and renderer draw
contracts. Its investigation and fixtures may be prepared in parallel, but
implementation should be parallelized only if Milestone 2 establishes
non-overlapping file ownership.

### Work

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

Tentative commit: `perf(webgpu): isolate dynamic placement updates`

## Milestone 5: Remove remaining measured renderer hot spots

Status: Pending the combined Milestone 3 and 4 review.

### Intended outcome

After retained scale and closeup dynamic updates are in place, any remaining
WebGPU CPU excess identified by the benchmark is removed without speculative
layers.

This milestone begins after a combined review of Milestones 3 and 4. It is
divisible by measured hotspot when the affected files and resource owners do
not overlap. Each accepted change should remain independently benchmarkable and
reviewable.

### Work

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

Tentative commit: `perf(webgpu-renderer): remove measured interaction overhead`

## Milestone 6: Integrate, guard, and reconcile

Status: Pending.

### Intended outcome

The optimized paths work together across WebGPU features, WebGL remains stable,
and future changes can reproduce the performance comparison without relying on
the private fixture in automated CI.

### Work

- Re-run the complete MCCA profiling matrix and publish the final comparison
  beside the baseline.
- Extract a small repository-owned stress fixture that reproduces the dominant
  retained scale and placement behavior without copying private MCCA data.
- Add lightweight structural regression checks for forbidden work on
  domain-only and closeup dynamic frames. Keep timing thresholds out of
  ordinary CI unless the runner environment is controlled.
- Reconcile every plan item as completed or discarded and update the renderer
  migration backlog before retiring this plan.

### Affected areas and downstream consumers

- WebGPU renderer, Core adapter, App SampleView, benchmark tooling, and
  repository-owned performance fixture.
- WebGL rendering and picking as the compatibility baseline.

### Verification

- Run renderer type, unit, lint, GPU, bundle, and package checks.
- Run focused Core WebGPU adapter/surface/context tests and App SampleView tests.
- Compare representative WebGL/WebGPU rendering and picking at DPR 1 and 2.
- Manually verify MCCA pan, zoom, both closeup transitions, vertical scrolling,
  and picking after motion on the reference 60 Hz display.
- Final review gate: inspect cross-milestone invalidation, disposal, picking,
  performance evidence, KISS conformance, and public API footprint.

### Documentation or migration

Update Core rendering architecture and the Core-WebGPU integration README with
the final retained-frame design. Retire the temporary plan according to the
repository workflow before merge.

Tentative commit: `test(webgpu): guard retained interaction paths`

## Subagent assignment and dependency map

- **Profiling agent (Milestone 1):** owns the benchmark driver, reproducibility,
  baseline collection, and attribution report. This is an appropriate bounded
  Luna task because it requires broad inspection and disciplined repeated
  measurements more than novel renderer design. Luna needs the private fixture,
  local App server, and hardware-backed browser access. Headless or software-GPU
  results do not replace final observation on the physical 60 Hz display. The
  remaining assignment is to add interaction-state/render-coverage assertions,
  correct the WASD and closeup-toggle no-op cases, remove scrollbar drag, and
  rerun the retained cells before optimization starts.
- **Retained-plan agent (Milestone 2):** owns the Core/renderer lifetime and
  invalidation contract after the Milestone 1 coverage gate. Keep this with one
  agent because it crosses the main architectural boundary.
- **Navigation agent (Milestone 3):** begins after the Milestone 2 review gate
  and owns scale-only updates plus pan/zoom verification.
- **Closeup agent (Milestone 4):** begins after Milestone 3 by default and owns
  App placement behavior plus Core/renderer placement synchronization. Its
  profiling and fixtures may be prepared earlier without editing the shared
  integration contract.
- **Hotspot agents (Milestone 5):** split only by independent measured hotspot;
  do not assign agents to speculative optimizations.
- **Integration owner (Milestone 6):** reconciles overlapping changes and runs
  the final cross-backend matrix. This should not be delegated piecemeal.

Agents working in parallel must not edit the shared retained-plan contract
independently. Contract changes discovered by navigation or closeup work return
to the Milestone 2 owner or are coordinated before implementation. Review
Milestones 3 and 4 together before starting measured renderer cleanup.

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
