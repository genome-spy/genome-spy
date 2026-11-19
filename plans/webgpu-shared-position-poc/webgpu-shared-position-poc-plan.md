# Prototype shared WebGPU position scale buffers

The SampleView experiment in #698 removed WebGPU writes while close-up scroll
still took more main-thread CPU in four of five pairs. Measure whether a generic
shared position resource can also remove repeated update work. The same path
must cover shared y in SampleView and shared x across tracks.

- Core resolves sharing per positional endpoint using its source
  `ScaleResolution`. An endpoint with a real, ancestor-owned scale can share
  even if its peer uses local coordinates. The adapter reads each used
  resolution's completed mapping once per pass after the view hooks. A renderer
  handle owns the GPU buffer and handles domain packing, changed-payload checks,
  and picking invalidation. Binding IDs and WGSL representation stay inside the
  renderer.
- Start with the fixed position layouts used by the test scenes. Two-value
  domains and the existing split index domain can use the same uniform shape.
  Store the gap geometry alongside the domain. Each renderer program adds one
  uniform binding per distinct handle to its existing mark bind group and reuses
  that binding for matching primary and secondary endpoints. The
  [WebGPU specification](https://www.w3.org/TR/webgpu/) defines binding layouts
  independently of the buffer resources bound to them. Three.js likewise
  [separates shared uniform state from object updates](https://github.com/mrdoob/three.js/blob/dev/docs/llms-full.txt).
  This first comparison can leave the existing bind-group count unchanged.
- Keep effective ranges, padding, band anchors, category lookup tables, gap
  cuts, and mark-dependent values on their existing paths. Omit the repeated
  viewport, domain, and gap-width writers for fields supplied by the shared
  buffer. Keep category membership updates in band channels even when their
  displayed extent is shared. Leave configurations that require a different
  uniform shape on their existing path. Scope conditionally scaled branches to
  the existing path unless the binding plan can assign their handles
  unambiguously.
- Use the shared gap geometry for both position mapping and the separate
  placement-fit predicate. Preserve retained mark and pipeline identities while
  numeric values change. Reevaluate the binding assignment when the mark
  configuration is replaced. Release the handle with the resolution or surface,
  and allow existing drawing, picking, and detached export to publish at the end
  of frame-plan synchronization, including handles created on that pass. A
  changed upload invalidates picking through the renderer without scheduling
  another frame. Keep the renderer API usable without Core types or objects.

Verify the standalone renderer with marks that share a handle alongside an
independent channel. Verify grouped SampleView scrolling and regrouping, a
24-track stack with native x navigation, stable pixels and picking, and a view
with simultaneous shared x and y. Compare against the same merged baseline in
headed Chromium using warmed, alternating runs. Count shared and mark writes,
mark synchronization checks, and scale binding reads in a diagnostic run, and
measure task CPU without the counters. The first prototype retains the existing
per-mark revision subscriptions. Report whether the result supports expanding
the resource API. The experiment does not alter the public GenomeSpy grammar or
require a release note for the unpublished renderer.

Tentative commit `perf(webgpu): prototype shared position scale buffers`.

## Results

The baseline was the squash merge of #751 (`a560ccaa3`). The browser was Chrome
157 on an Apple Metal 3 adapter. The SampleView fixture has 1,536 samples, 24
groups, and 20 metadata attributes. The track fixture has 24 tracks and a shared
x domain above 2²⁶.

| Interaction                | Diagnostic visible frames | Mark uniform writes | Shared scale writes | All queue buffer writes | Median paired change in task CPU |
| -------------------------- | ------------------------: | ------------------: | ------------------: | ----------------------: | -------------------------------: |
| SampleView close-up scroll |                        40 |         1,360 → 120 |              0 → 40 |             1,480 → 280 |              −10.9% (5/5 faster) |
| Track x pan                |                        26 |             624 → 0 |              0 → 26 |                676 → 78 |               −3.1% (3/5 faster) |
| Track x zoom               |                        56 |           1,344 → 0 |              0 → 56 |             1,456 → 168 |              −23.0% (4/5 faster) |

Each timing is a main-thread task CPU window around the same scripted
interaction. Five alternating pairs followed a warm-up pair, with
instrumentation disabled. The later ownership and layout validation changes
preserved the diagnostic counts. Track timings varied substantially across
pairs. The experiment measured CPU work and GPU buffer writes on one machine.

SampleView per-mark binding checks fell from 23,440 to 17,560. The retained mark
synchronization count stayed at 1,360. In both scenes navigation created zero
bind groups and triggered zero layout passes. The 120×90 export comparisons
matched exactly after regrouping SampleView and at an identical, settled track
domain. Standalone Chrome tests covered two shared handles on one mark,
independent ranges, gap visibility, picking invalidation, and continued use
after a consumer is destroyed. The 360 targeted unit tests and both workspace
type checks passed.

The results support retaining the shared domain path for further evaluation. The
prototype still allocates each mark's local domain fields and retains its
revision subscriptions. The results describe upload and CPU savings for the
three interactions above. The local script and raw measurements are under
`output/webgpu-shared-position-poc/`.

The follow-up review covered unscaled layered positions, a mixed scaled and
fixed endpoint, and a repeated invalid gap update. Both reference scenes again
produced one shared write per changed frame and matched the reduced-resolution
baseline exports. The verification zoom generated 71 frames, with 24 mark
uniform uploads per frame on the baseline and zero on the PoC. All 363 targeted
unit tests, both Chrome GPU tests, and both type checks passed.
