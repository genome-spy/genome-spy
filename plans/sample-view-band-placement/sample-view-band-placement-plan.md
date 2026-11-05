# SampleView band placement implementation plan

Status: native categorical viewports and scalar group translation are implemented
and validated. Reusable WebGPU adapter, placement and uniform-writer changes now
belong to the independent `codex/webgpu-retained-updates` foundation PR; this
SampleView branch stacks on it. The split preserves the previously tested
`a13287481` package tree exactly. Independent reviews have no outstanding findings.
Earlier pane and native timing results below remain historical comparisons with
their original instrumentation limits.

The original independently reviewed plan was committed before implementation on
2026-11-03. Retain this temporary plan on the feature branch until pre-merge
retirement.

- Issue: [#573](https://github.com/genome-spy/genome-spy/issues/573).
- Foundation: [#647](https://github.com/genome-spy/genome-spy/issues/647), implemented
  by [#648](https://github.com/genome-spy/genome-spy/pull/648).
- Original base: `6b495c5578730d555c794c903767810f3b4c875c`.
- Current PR base: `codex/webgpu-retained-updates`.
- Frozen pane comparison: `914e34a9b`.
- Branch: `codex/sample-view-band-placement`.

## Goals, scope and acceptance policy

Remove metadata's animated placement texture and the internal `facetIndex`
rendering path. Use ordinary band encodings and the existing native categorical
viewport for metadata and labels. Preserve sample identity, layout options,
provenance, sorting/filtering/undo, gestures, sticky summaries, label fitting,
metadata behavior and independent within-sample scales.

Simplify cached row/group geometry, sample lookup, group intervals and axis
selection without rebuilding the retained scene on ordinary navigation. Retain
complete plot placement topology and renderer culling. There is no new generic
regular-grid placement protocol, authored scale grammar, categorical persistence
format or public navigation API.

The user's latest instruction explicitly allows a measurable performance cost
for a substantially cleaner architecture. This supersedes the original hard
non-regression gate. Measure absolute CPU cost, cadence and responsiveness, report
repeatability and uncertainty, and evaluate that tradeoff openly. Do not reject
native viewport resource updates merely because they occur per mark, and do not
claim a speedup from lower counters or isolated render timers. Unchanged behavior
and correct geometry remain requirements.

## Architecture check and ownership

Start from [ARCHITECTURE.md](../../ARCHITECTURE.md), the
[App architecture](../../packages/app/APP_ARCHITECTURE.md), Core's
[view/dataflow architecture](../../packages/core/docs/architecture/views-and-dataflow.md),
and [rendering architecture](../../packages/core/docs/architecture/rendering.md).

| Owner                    | Responsibility and sources                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App sample state         | Stable identity, display order, grouping, filtering and undo. `sampleView/state/sampleSlice.js`, `sampleView.js`.                                                                                                                          |
| App LocationManager      | Display topology, requested row camera, density/spacing policy, peek timing, scroll bounds, sticky-summary geometry, stable sample/group rectangles and complete plot placement publication. `locationManager.js`, `sampleViewTypes.d.ts`. |
| Sidebar scale resolution | Metadata/label category identity and native viewport projection, separate from plot and summary y-scales. `sampleView.js`, `metadata/metadataView.js`, `sampleLabelView.js`.                                                               |
| Structural group chrome  | One unscaled interval representation using the requested row camera, including zero-height rows and viewports inside an internal group gap. `sampleGroupView.js`.                                                                          |
| Core scale runtime       | Exact imperative viewport publication, constrained public navigation, completed mappings and renderer notification. `scaleResolution.js`, `domainRuntime.js`, `scaleInstanceManager.js`.                                                   |
| Core numeric mapping     | Shared band/gap projection and inverse search. `bandMapping.js`, `scaleBand.js`.                                                                                                                                                           |
| Renderers                | Retained category/series resources, mark-owned scale bindings, ordinary placement, picking and exports. `rendering/*`, `view/layout/placementSource.js`, the WebGPU renderer's public contracts.                                           |

The band wrapper retains its existing Vega attribution. Independent navigation
state follows the established [D3 zoom transform pattern](https://d3js.org/d3-zoom#zoomTransform),
with fixed gaps handled by GenomeSpy's existing mapping. No external code is copied.

## Current design

### 1. Stable topology and the requested row camera

Build ordered displayed sample IDs and nonempty leaf/ancestor intervals only when
the sample hierarchy changes. Keep stable sample IDs as the band domain. The
public `visibleSamples` parameter retains ingestion order; private sidebar inputs
follow display order. Publish IDs and gap cuts coherently on sorting/filtering/undo.
Complete retained plot packing remains separate from displayed membership.

LocationManager owns the App-specific camera policy. With N displayed rows, L
nonempty leaves, summary height h, group spacing s and plot height H, the fitted
step is `max(0, H - L*h - (L-1)*s) / N` for nonempty input. Closeup uses configured
`sampleHeight`. Preserve existing peek easing, anchored opening, small-cohort
bounce, transient anchors, scroll clamping and animation disposal.

Keep one shared requested-camera object containing step, gap, inset, origin and
summary height. Interpolate endpoint step, pixel inset, group spacing and effective
translation. Stable sample/group `locSize` getters consume these scalars; navigation
does not mutate every row or rebuild topology. Logical row starts are
`origin + rank*step + leafIndex*gap`, with the common inset applied at both edges.

These scalars remain App layout inputs, not a second raw band scale. Plot rows and
summary/group chrome consume them directly; metadata and labels use Core's
completed viewport projection. Do not claim that CPU geometry ownership has fully
moved to Core. Projecting every CPU row through the categorical mapping would add
per-row gap searches, while reading completed coefficients back would add feedback
and fail to recover slope from a gap-only viewport.

### 2. Fixed range and the native categorical viewport

Declare the shared band y-scale on the existing sidebar scope, sharing y through
metadata and labels while keeping metadata x/color and plot/summary y independent.
Keep the ordinary reversed range `[1,0]`, complete displayed-ID domain and zero
band padding during navigation. Disable independent sidebar gesture zooming;
SampleView remains the interaction owner.

After current IDs, cuts, gap width and inset parameters settle, convert the
requested camera to exact rank interval and fractional gap-edge ranks with Core's
existing numeric inverse. For native mapping m, height H, requested step d, gap g
and origin o:

- Target slope is `-d/H`.
- Target origin is `1 - (o + m.domainStart*d + m.firstRank*g)/H`.
- Invert range edges 1 and 0 using that slope, origin and explicit gap width `g/H`.
- Publish the returned rank values and gap ranks through `scale.viewport()`.

The explicit target gap width matters when the previous mapping is exhausted or
entirely inside a gap: its fitted gap width is suppressed to zero. The optional
fourth `invertPoint` argument supplies the complete requested camera without
adding App gap-search code. Existing inverse callers retain their default behavior.

The imperative `scale.viewport(value)` setter validates, copies and publishes
exact state through the native domain runtime, symmetric to imperative domain and
range setters. It can represent summary reserves outside category bounds,
sub-band intervals, partially visible gaps and bounce. Public `zoomToViewport()`
and gesture navigation retain their current domain limits and one-band minimum.
Changed membership still reconciles stale viewport state through the existing
lifecycle before App republishes its camera.

Remove the sidebar `PlacementSource`, normalized rectangle, placement options,
geometry revision, constructor/disposal work and rendering-context wrapper.
Metadata no longer relies on special arrangement or draw-level pane injection.
Generic placement support remains for independently scaled repeated plots.

### 3. Metadata, labels and structural group intervals

Metadata uses a collision-free generated sample-ID field; labels use `id`.
Ordinary implicit band coverage supplies both row edges. Preserve missing-value
backgrounds, quantitative bars, hidden/dynamic attributes, hover, tooltips, menus,
auto label width, ranged text fitting/fading and `flushY: false`. Use opposite
pixel offsets for the shared inset; applying one inherited offset to both edges
would translate the row instead of padding it.

At requested step zero, explicitly hide metadata rows and labels without
inverting a zero-slope camera. Keep the same fixed summary/gap allocation. A
viewport inside a grouping gap may also have no visible rows while summaries and
group chrome remain meaningful.

Group markers use one structural, unscaled interval representation. Their bounds
come from start/end ranks and first/last leaf indices over the same requested
camera: include the leading summary, exclude the trailing intergroup gap and
include internal descendant gaps for ancestors. This replaces both the old
band-endpoint layer and its zero-step fallback layer. It handles a nested ancestor
spanning a gap-only viewport, where the categorical mapping alone cannot supply a
useful group rectangle. Preserve depth/count/title, `_rawGroup` and interactions.
The ordinal `range(500)` and animated `updateRange()` machinery remain removed.
Primary y/y2 use the normalized scalar anchor `1 - origin/H`; datum-dependent
offsets exclude scrolling origin so settled scrolling retains group geometry.

Generated chrome must retain explicit scale ownership without creating another
container or enabling ordinary guides on chrome. Use the actual common sample
plotting interval; metadata title reserve and sidebar overhang must not shift rows.
Fixed metadata guides and labels remain in their ordinary viewport coordinates.

### 4. Retained plot arrangement and consumer simplifications

Retain the complete nonempty row batch and let renderers cull occurrences.
Ordinary scrolling changes neither occurrence membership nor full layout.
Request membership reflow only for wholly empty/nonempty transitions, detected
before the renderer consumes pending layout requests. Clear stale facet coordinates
for an empty repeated subtree while retaining complete packing topology/resources.
Keep distinct stable per-row geometry and isolated option envelopes.

Exact/nearest sample lookup uses binary search over monotonic live row bounds,
including padding/gap exclusion and the existing nearest-row tie rule. Axis
eligibility uses one fitted overview row height. Middle-axis selection follows
the nearest center to the physical population midpoint, not median rank. Preserve
overview-only axes and stable horizontal reserves through peek.

Complete plot placement normalization/snapshots still require one O(sample count)
pass. Texture removal and layout-free navigation do not make the entire frame
constant time. Do not add another placement cache or protocol without evidence.

### 5. Retired renderer paths and retained general corrections

The internal `facetIndex` semantic channel, types, schema remnants and App-agent
whitelist entry are removed. Retire its WebGL metadata texture upload/cache/bind/
disposal and shader mode, immediate/Canvas/SVG regrouping and placement lookup,
and WebGPU encoded facet-index cache/branches. Keep ordinary facet uniforms,
draw-level ranges, repeated-view placement and renderer-owned resources.

General fixes discovered during the migration remain independently useful:

- Explicitly declared scales bind correctly inside generated chrome.
- WebGPU band/point ordinary and text positions honor effective ranges with
  reversal applied once; WebGL categorical positions use live range uniforms.
- WebGL's y-gap denominator correctly groups viewport and placement heights.
- WebGPU constructs target-pixel offsets/geometry after placement, including
  unclamped rects, points, links and arrows, consistent with existing text/rules.
- Immutable categorical snapshots adopt equal replacement references, avoiding
  repeated full-domain comparisons.
- Existing literal classification emits renderer constants for unscaled literal
  channels while expressions, scaled datums and opacity remain live.

## Milestones and implementation history

| Milestone                  | Outcome                                                                                                                         | Commit/status                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Plan                       | Independent architecture review and written implementation plan                                                                 | `03cb01e45`                                         |
| 1                          | Shared scale ownership and effective categorical range parity                                                                   | `37ba9a426`                                         |
| 2                          | Scalar row model and ordinary metadata/label band coverage                                                                      | `1076a1f1e`                                         |
| 3                          | Metadata texture and internal facet-index renderer retirement                                                                   | `331d6aa3d`                                         |
| Renderer integration       | General target-pixel placement correction                                                                                       | `032dbaf0c`                                         |
| 4, previous design         | Shared pane, cached scalar bounds, interval groups, binary queries and stable chrome                                            | `361b2009b`                                         |
| Previous validation record | Pane evidence and reconciled plan                                                                                               | `914e34a9b`                                         |
| Native viewport revision   | Exact viewport publication, pane/context removal, configured inverse gap width, one structural group layer and zero-row opacity | Committed as `163317a93`; validation recorded below |

The user authorized implementation and milestone commits. The native revision is
one coherent follow-on milestone; tentative commit:
`refactor(app): navigate sample rows through the band viewport`.
It affects App row/metadata/group integration and the existing Core viewport
setter/inverse contracts. Its focused regression coverage and final composed
review cover that boundary together. No new authored grammar or migration is
required. Update the App ownership paragraph and existing release fragment only
where the final behavior warrants it.

## Why earlier experiments do not reject the native viewport

The first migration kept `viewport: null` and animated the full-domain range.
Mark-owned scale bindings then changed per metadata mark. Early candidates also
contained accidental domain-snapshot and literal-resource overhead later removed.
Those measurements did not evaluate the proper fixed-range viewport path and do
not establish that native viewport updates are too expensive. The current work
measures that path directly rather than treating resource fanout as a blocker.

A separate experiment arranged only the exact on-screen rows. Newly exposed rows
were absent from retained commands, so that implementation requested whole-layout
reflow. It produced 63–75 layout/replay/preparation cycles per recorded scenario,
adding roughly 77–130 ms where the original had none. A buffered version reduced
this to 4 opening and 10–11 scrolling reflows but still cost more. These were costs
of the chosen retained-membership strategy, not scale updates. Both versions were
discarded; full retained arrangement remains.

The pane implementation avoided settled-scroll metadata scale writes and passed
its earlier non-regression gate. The user questioned that architectural workaround.
It is now replaced by native viewport updates. Their measured CPU cost and
simpler integration are recorded below under the revised acceptance policy.

## Current validation and completion

Focused Core regression coverage distinguishes exact imperative state from
constrained public navigation, preserves detached input/shared mapping/events,
and checks exhausted source → gap-only viewport → visible-row recovery with an
explicit configured gap width. Existing App composed coverage checks fixed range,
row/metadata/label alignment, retained empty-batch recovery, sticky summaries and
nested structural group bounds. Independent review of the latest group change has
no outstanding findings.

Validation uses the native candidate; previous pane results below are historical
controls. Relevant contracts include:

- Native WebGL/WebGPU moderate and metadata-heavy stress cases, with matching
  deterministic fixtures, headed browser, hardware, viewport/DPR and input traces.
- Both render duration and whole-interaction thread CPU, plus cadence/tails and
  actual resource writes. Use paired repeats and same-backend variation; renderer
  timers exclude some input/publication work and cannot stand alone.
- Ordinary navigation without layout churn; correct identity after sort/filter/
  undo; overview, anchored peek, closeup, gaps, resize, short-content bounce,
  exhausted fit, row taller than viewport and empty displayed membership.
- Canvas/SVG composed output, fixed metadata guides, ranged label behavior,
  missing values, group/summary extents, picking and exports as affected.
- Existing categorical navigation/reset/membership contracts in Core's focused
  suites. Renderer viewport projection is also exercised by native SampleView;
  unchanged heatmap and navigation browser controls were not rerun.
- The supplied exact MCCA G score bookmark with sticky summaries and threshold
  changes, bounded data readiness and matching loaded-data state.

### Native revision completion record

- [x] Current implementation replaces the sidebar pane/context with fixed-range
      native viewport publication.
- [x] Exact setter and configured inverse gap-width contracts have focused coverage.
- [x] Structural groups use one interval layer, including nested gap-only and
      exhausted-row cases.
- [x] Independent implementation review has no outstanding findings.
- [x] Record final native browser/composed validation and known limitations.
- [x] Record paired native-versus-pane timings, variation and observed responsiveness.
- [x] Recompute current production-line counts against the original base and pane.
- [x] Finish applicable static/release checks, reconcile the final plan and commit
      the coherent native viewport milestone.

### Initial native results (instrumented)

Frozen pane: `914e34a9b`, isolated source snapshot on port 4182. Native runtime:
`163317a93`, port 4181. SHA-256 over the final 1,927 package files:
`ca3848b5a4972dd5580d4db66755f49faaac6074b2847e6a130b891db1de6e97`.
Detailed source manifest, commands, raw results and local report remain under
ignored `output/sample-view-band-benchmark/` (`viewport2-*` and `pane-head-*`).

Headed Chrome 156, native Apple M5 Metal, DPR 1, 1200×700. No browser or heavy
check ran concurrently with performance measurements. Paired whole-interaction
measurements warm both versions first, alternate order, and receive exactly 94
wheel events plus one E-down/up. Render counts are 150–152 per trace. CPU totals
include input/publication and the open/scroll/close cycle; render timing alone
does not. The final integration includes group-configuration updates, so these
costs are not attributed exclusively to metadata uniform writes.

| Case                                     | Pairs | Pane mean render CPU ms | Native mean render CPU ms | Pane whole thread CPU ms | Native whole thread CPU ms |
| ---------------------------------------- | ----: | ----------------------: | ------------------------: | -----------------------: | -------------------------: |
| Moderate WebGPU: 384 samples, 8 columns  |     2 |                    1.54 |                      1.95 |                    440.6 |             528.9 (+20.0%) |
| Stress WebGPU: 1,536 samples, 32 columns |     3 |                    3.09 |                      4.12 |                    676.2 |             886.7 (+31.1%) |
| Stress WebGL                             |     2 |                    2.44 |                      2.17 |                    579.1 |              597.7 (+3.2%) |

WebGPU CPU increases are real: every paired comparison costs more, though the
size varies. Stress render p95 changes from 4.6–4.7 ms to 6.1–6.8 ms. WebGL pair
differences change sign, so its aggregate does not establish a meaningful
regression or speedup. Native cadence p95 stays 16.9–17.6 ms with no candidate
gaps above 33.3 ms; all traces have zero layout computations. A single paired
Canvas stress scroll measures 20.55→20.27 ms mean render CPU, cadence p95
17.6→17.7 ms and long gaps 12→11: effectively unchanged.

A separate instrumented resource probe is diagnostic only. For eight metadata
columns plus labels it observes 17 row marks, each updating y/y2 viewport slots
once per settled wheel frame: 34 logical viewport writes. Categorical domains
remain retained with zero domain writes. This is ordinary mark resource work,
without sidebar placement, category-buffer re-encoding or layout churn. No
isolated GPU-timestamp improvement is claimed.

Native WebGL/WebGPU row alignment passes overview, animated peek, closeup and
scroll with fixed `[1,0]` range and sub-pixel projection agreement. Actual
sort/filter/undo checks retain 384→182→384 sample identity and all 15 explicit
plot picks per backend match. Metadata remains configured unpickable. The exact
MCCA bookmark passes on WebGL with 486 samples, seven G score summaries, five
complete sources, stable sticky summaries, both context menus and threshold
updates without row movement or errors. The existing WebGPU grouped-summary
limitation below was not addressed or claimed fixed.

All 839 tests in 87 SampleView/Core-scale files pass, along with App and Core
TypeScript checks, lint and formatting. The existing App patch changeset remains
accurate; release-policy/status checks pass and the previously queued 1.3.0
release is unchanged. Independent final production review has no findings.

### Current production size

Exact non-comment production JavaScript counts exclude tests, test helpers,
comments, blank lines, declarations, GLSL and `.mjs` tooling. Against frozen pane,
the initial native revision adds 59 and deletes 131 lines: net **−72** (App −84, Core +12).
After the scalar-anchor optimization, the SampleView PR against optimized master
`bf3f42afa` has these counts:

| Package         | Added | Deleted | Current net runtime JS |
| --------------- | ----: | ------: | ---------------------: |
| App             |   519 |     505 |                    +14 |
| Core            |   130 |     270 |                   −140 |
| WebGPU renderer |     7 |      56 |                    −49 |
| App agent       |     1 |       7 |                     −6 |
| Total           |   657 |     838 |               **−181** |

The default counter also includes the App test helper (+15/−1); exclude it from
shipping runtime totals. Declaration-inclusive PR net is −187; unchanged GLSL
removals are separate. App does not meet the original projected 100–250-line
reduction, but its growth falls from 99 to 14 runtime lines. The architectural
gain is deleting sidebar placement/routing and duplicate group rendering paths.

## Historical optimization and independent local master landing

The App group-origin fix uses one private normalized anchor, `1 - origin/H`, as
the primary y/y2 ValueDef resource. Rank/leaf offsets no longer include scrolling
origin, so settled scrolling retains encoded group geometry. Its rebased commit
is `ca938e55c`. Nested gaps, summaries and exhausted fits retain their bounds.

The generic commit was developed on master as `07e290f66`, applied for measurement
to this branch as `e89be098b`, then independently cherry-picked to local master as
`bf3f42afa`. It distinguishes resource expressions from mapping changes while
preserving the aggregate Mark resource revision. WebGPU compiles all bindings
and a scale-dependent subset; mapping-only updates skip unrelated values.
Scaled conditional values, semantic thresholds, selection changes and complete
configuration replacements stay live. No new subscriptions, GPU ownership,
buffers or shader variants. The commit adds 60 and removes 20 production JS
lines, net +40 on master. It needs no release fragment for the unpublished path.

Three counterbalanced stress pairs, holding the separate App fix constant, show
instrumented resource-sync phase time 1.427→1.292 ms/frame (−9.4%). Instrumented
whole-thread CPU 847.35→844.86 ms is within variation. A matching 60-wheel probe
shows 31,680→18,900 binding reads (−40.3%), with 2,400 writes on both versions.
The App fix removes settled group configuration misses, 120→0 over those frames.

A separate three-pair control disables profiling entirely and checks that the
profiler is absent: whole-thread CPU 845.29→844.29 ms, also within variation.
There is no established whole-application speedup. Keep the optimization as a
bounded reduction in unnecessary synchronization work. Earlier 20–31% native
versus pane CPU figures enabled diagnostic profiling, including GPU-write
wrappers; they are not verified normal-application slowdown factors.

The literal-property prototype `bcfcc5f72` gave no reliable whole-CPU benefit and
was discarded from both selected branches, retained only on an experiment branch.
Per-leaf mapping guards, snapshot reuse and shared GPU buffers remain deferred.

Master checks: 222 focused tests. Merged feature: 230 focused tests, Core types
and scoped lint. Native master heatmap navigation/zoom passes before and after;
feature alignment, sort/filter/undo, 15 plot picks and the exact WebGL G-score
bookmark pass. Independent final reviews have no findings. Release policy passes
and the queued 1.3.0 version is unchanged.

Rebase conflict resolution preserves the feature's immutable snapshot handling.
The rebased package tree is byte-identical to measured `e89be098b`; master is
byte-identical to tested `07e290f66`. The pre-rebase feature history remains on
`codex/sample-view-before-resource-sync`. Generic temporary planning was retired
before the direct master landing. Detailed local evidence is in ignored
`output/sample-view-band-benchmark/webgpu-resource-sync-evaluation.md`.

The combined tree versus the original base, including the independently landed
generic optimization, is −141 production JS lines (Core −100). The PR-only table
above excludes that master change and remains −181 (Core −140).

## Historical pane validation and production size

These results describe frozen pane runtime `361b2009b`, recorded at `914e34a9b`.
They are comparison history, not acceptance evidence for the current native
revision. Full historical details and build hashes are in the ignored local
`output/sample-view-band-benchmark/final-summary.md`.

The prior full suite passed 580 files and 5,541 tests, with workspace types, lint,
schema and release checks. Its final small publication cleanup passed all 423
SampleView tests. Independent reviews had no outstanding findings.

Covered GPU synthetic timings were indistinguishable from measured variation,
which the user accepted. Canvas moderate opening/scroll means were about 5.1/5.3 ms
versus 8.5–8.8/8.0–8.3 ms original base; stress about 25.2/20.7 ms versus
62.9–65.8/51.6–53.9 ms. Fresh closeup picking medians were WebGL 4.8→2.7 ms,
WebGPU 2.15→1.5 ms and Canvas 2.1→1.45 ms; SVG exports improved without warnings.
These comparisons must not be silently relabeled as native viewport measurements.

The prior pane runtime, compared with original base `6b495c557`, added 713 and
deleted 821 non-comment production JavaScript lines, a net reduction of 108.
This excludes conventional tests, the changed App test helper, comments, blank
lines, declarations, GLSL and `.mjs` benchmark tooling. The counter before excluding
the helper reported +727/-822. Including declarations gave +713/-827, net -114.

| Package         | Added | Deleted | Previous pane net runtime JS |
| --------------- | ----: | ------: | ---------------------------: |
| App             |   594 |     495 |                          +99 |
| Core            |   111 |     263 |                         -152 |
| WebGPU renderer |     7 |      56 |                          -49 |
| App agent       |     1 |       7 |                           -6 |
| Total           |   713 |     821 |                         -108 |

The earlier App reduction estimate was not achieved by the pane version; its App
code grew because of pane ownership and a separate zero-step group fallback.
The native revision removes both structures; its current counts above include the
new Core contract code without counting test/doc deletions as simplification.

## Realistic G score integration and baseline limitation

The supplied exact full-App MCCA bookmark restores 486 retained samples, seven
CancerType groups, seven visible G score summaries, hidden labels and five complete
data sources. Original-base, pane and current native WebGL checks pass overview/
peek/scroll, fixed sticky summaries, metadata/summary context menus and threshold
changes without row displacement or loading errors.

Both untouched original base and pane reproduced the same existing WebGPU grouped
summary failures: placement-enabled-mark errors followed by invalid finite-scope
bounds. That bookmarked state has no valid WebGPU performance baseline. Do not
claim those errors fixed or treat them as a native viewport regression; report the
current observation explicitly. Matching supported synthetic cases provide the
valid GPU comparison, and the restored full bookmark provides realistic WebGL
correctness/CPU evidence.

## Deferred opportunities

- Complete plot placement normalization/snapshots remain O(sample count). A generic
  regular-band placement representation could remove copies, but requires a
  supported renderer contract and measured benefit.
- Preserve topology across unrelated geometry-only reflows by checking immutable
  group identity. Ordinary scrolling already has no layout rebuilds.
- Live band padding could replace paired pixel inset offsets, but needs a coherent
  Core/runtime/renderer contract; raw static setters are insufficient.
- Shared renderer scale resources may reduce per-mark viewport writes in layered
  categorical views. Measure current costs before introducing such ownership.
- Visible-only arrangement requires cheap retained-occurrence updates rather than
  whole-layout recompilation. The measured exact/buffered reflow versions remain
  discarded.
- A fully Core-owned CPU row mapping would need to preserve cheap cached bounds
  and meaningful zero-step/gap-only geometry. The current requested App camera is
  intentional; do not add round-trip caches merely to claim single ownership.

## PR split and delivery

The WebGPU foundation targets remote master and contains scale-only binding
updates, frozen-domain reuse, static literal slots, live categorical ranges,
pixel geometry under placement and retained typed uniform writers. It preserves
legacy metadata facet support so it is independently usable. Its active
[plan](../webgpu-direct-updates/webgpu-direct-updates-plan.md) records the selected
implementation, discarded experiments, measurement limits and further WebGPU
optimization opportunities. The earlier local-master landing above is history;
the current delivery puts all selected reusable WebGPU work in that PR.

This upper PR contains SampleView placement/navigation, the metadata placement
texture and internal facet removal across backends, exact imperative viewport
publication, retained group-origin updates and SampleView benchmark-driver
coverage. The clustered-heatmap example is now already on master, so its
duplicate commit was dropped during the November 5 rebase. No rejected routing
or visible-row reflow experiment is restored. The original milestone history
remains on `codex/sample-view-before-webgpu-split`.

Package-tree equality against `a13287481` was the original history-only split
check. The November 5 rebase and native checks below supersede that delivery
status. PR #660 remains based on #659; merge the foundation first and then
retarget the upper PR to master.

## November 5 rebase and native verification

The foundation was rebased onto master `5a2b42d33` and this SampleView commit
replayed on top. Both remain draft PRs. The combined stack passes all 5,595
existing unit tests (one skipped and two todo), all workspace types and lint,
and WebGL point/arrow/rule composition checks at DPR 1 and 2. All 141 native
Metal renderer GPU tests pass across the initial run and six corrected reruns:
four needed checksum-pinned ignored oracle assets, while the placement-picking
fixture needed to request its documented optional clipping explicitly. Release
policy/status checks pass with the existing fixed-group patch fragments.

Grouped summaries reproduced the historical WebGPU placement failure. The
foundation now recreates a retained GPU mark when its placement compile mode
changes: grouping turns a single unplaced summary into several draw placements.
This is a Core handle-ownership correction, with no renderer API change or App
bypass. Its 51 Surface/context tests, Core types and scoped lint/format pass;
the production condition adds three raw lines. Native grouped synthetic warmups
now pass on both backends with eight groups and matching 384-sample membership.
The historical failure above is retained as evidence about the old baseline,
rather than a claim that the corrected stack still fails.

### Backend CPU comparison before the occurrence follow-up

Hardware-backed headless Chrome 156.0.8078.80 on Apple M5 uses ANGLE/Metal for
WebGL and Apple Metal-3 for WebGPU. The normal App harness runs without Core
profiling, samplers, tracing or frame/long-task observers. CDP's threadTicks
measures whole renderer-main-thread CPU; render counts are deliberately not
instrumented. Grouping uses the same augmented App action as its menu, outside
the timing window. Exact displayed IDs and full membership match across
backends.

Each scene/backend receives two warmups followed by three alternating paired
traces. A trace contains 24 native wheel zoom events, two horizontal drags with
48 moves each, E-held closeup, 24 vertical scroll events and key release.
Inertia settles for 1,600 ms after each phase. Windows last about 16.4 seconds.
All 12 traces verify camera movement, scrolling, settled closed state and
absence of browser/loading errors. Maximum paired camera endpoint difference is
0.080% of the current span for moderate and 0.172% for stress; scroll endpoints
match.

| Scene                                         | WebGL CPU samples (ms)    | WebGPU CPU samples (ms)    | Means GL / GPU (ms) | GPU difference |
| --------------------------------------------- | ------------------------- | -------------------------- | ------------------- | -------------- |
| 384 samples, 8 groups, 8 metadata columns     | 948.147, 816.649, 879.437 | 883.752, 858.679, 847.079  | 881.411 / 863.170   | -2.07%         |
| 1,536 samples, 24 groups, 32 metadata columns | 769.519, 728.073, 650.491 | 1014.689, 946.073, 949.904 | 716.028 / 970.222   | +35.50%        |

Both fixtures include 32 signal segments per sample and grouped summary tracks.
Moderate pairs vary in direction, so there is no clear CPU winner. Every stress
pair uses more WebGPU CPU (+31.86%, +29.94%, +46.03%). This is a backend
comparison on the corrected stack, not a PR before/after result or a measurement
against the retired pane architecture. Keep the historical +18.5% tradeoff
separate. No headed cadence, input latency, browser-process CPU or GPU-time
claim follows.

Artifacts use
`output/sample-view-band-benchmark/sampleview-grouped-summary-final-cpu-*`. The
tested upper head is `5bcdad94697671d99bb3ef54fb89349d4e732837`, with an empty
package diff and source manifest SHA-256
`df0a1936b1eab2bfa233fd65fec3bbdddf5ba4b03ae4b886ae737f96c489686e`. Later
delivery notes and commit-message wrapping do not change those package contents.
The temporary driver and all fixture/source hashes are recorded in metadata. The
initial summary attempt failed before timing; the no-summary attempt was stopped
before timing to fix the real summary failure. Neither is performance evidence.
The preliminary ungrouped smoke is also excluded.

### Attribution and resolved real-cohort failures

A separate one-pair stress profile requests 1,000-microsecond V8 sampling.
WebGPU occurrence refresh accounts for about 166.6 ms inclusive sampled wall
time, with repeated live Rectangle/clip getter evaluation prominent. Renderer
normalization is about 70.6 ms inclusive; draw normalization about 38.8 ms self.
Uniform writes and native command submission also appear. Sampled GC wall time
is about 49.9 ms WebGPU versus 23.1 ms WebGL. Inclusive rows overlap; do not sum
them or interpret wall samples as a CPU decomposition of the 35.50% gap. The
first follow-up is a bounded audit of scalar materialization at the existing
occurrence/scope boundary, with unsampled A/B verification before retaining any
change. No new invalidation or cache protocol is proposed.

The first real MCCA interaction check passed WebGL but reported 59 invalid
WebGPU scope bounds, despite complete loading and successful state assertions.
Browser instrumentation identified the first failure during closeup scroll:
`viewRoot/samples/grid_layers` had finite bounds x=286, y=85, width=1025,
height=-105.55048641099647. Offscreen chromosome grids also became empty.
Core Rectangle intersections intentionally allow negative empty dimensions;
renderer scopes require nonnegative dimensions.

The foundation now translates those empty scope dimensions to zero, preserving
NaN validation and live reentry. Both historical WebGPU failures are resolved:
placement compile-mode transitions and empty clipped scope bounds. The complete
real MCCA Copy-number patterns sequence now passes on both backends: 486
samples, seven CancerType groups and G-score slots, all five data sources
complete, native brush creation/change and public clear, UI threshold slider
0.5 -> 0.9 with changed summary data and unchanged rows, closeup scrolling,
sort/filter and undo restoring identity/order. The final scalar candidate has
zero browser or reported errors. Its artifacts use `mcca-scalar-clip-*`.

### Accepted scalar clipping follow-up

The foundation retains inherited clipping plus the captured static mark clip
mode instead of composing another Rectangle graph. Scissor intersections use
scalar inputs; directional clipping, `never`, signed empty scissors, double
precision and inherited-only anchor culling are preserved. Existing placement
and x-index checks reject unused occurrences before visible-range refresh.
There is no new cache, invalidation protocol or renderer API change.

Four warmed alternating pairs compare baseline `554723f91` with the candidate
on WebGPU, using the same native grouped wheel/pan/closeup trace. Three matching
same-code pairs per scene establish context/order variation:

| Scene | Baseline / scalar CPU means (ms) | Change | Same-code A / B means (ms) | Control change |
| --- | --- | --- | --- | --- |
| 384 samples, 8 groups | 864.252 / 758.774 | -12.20% | 879.673 / 858.742 | -2.38% |
| 1,536 samples, 24 groups | 931.574 / 814.980 | -12.52% | 964.512 / 929.222 | -3.66% |

All four stress pairs improve; three moderate pairs improve and the last is
+4.74%. Controls show nonzero context/order bias; do not subtract percentages
or promise a universal speedup. All 28 comparison/control traces pass identity,
loading, grouping, movement and settling checks. Initial PNGs are byte-identical.
Candidate camera endpoint differences stay below 0.058% of the span and scroll
checkpoints match. Profiling, tracing, allocation sampling and frame observers
remain disabled. These are native hardware headless renderer-main-thread CPU
measurements, not headed cadence, input latency or GPU execution time.

The smaller deletion-only candidate did not establish a consistent benefit
(+7.04% moderate, -5.34% stress with mixed pairs). The scalar candidate adds
54 and deletes 46 non-comment production lines, net +8, justified by the larger
measured reduction beyond controls. Foundation tests pass 52 cases and upper
stack tests 51; Core types, scoped lint/format and release checks pass. The
[foundation plan](../webgpu-direct-updates/webgpu-direct-updates-plan.md)
records all samples, rejected experiments and source hashes. Follow-up artifacts
use `sampleview-scalar-clip-{cpu,control}-*`; the accepted upper module SHA-256 is
`273eb7b76ee0174bfc131c7e873d6c1f482517d7aa62c20ef326c64756522247`.
Delivery rebase preserves that module and its regression tests byte for byte.

The older backend table above predates this change. Do not combine measurements
from separate runs to infer a new WebGL gap, or claim the historical +18.5%
pane comparison is resolved. Reprofile normalization and submission before
choosing another optimization; the larger shared-geometry cache remains deferred.

## Plan retention

Use `prepare-genomespy-change` and `write-genomespy-changeset` at delivery. The
existing App patch fragment records metadata identity-collision and exhausted-row
fixes. Assess final user-visible effects; pure refactoring and the unpublished
WebGPU renderer do not independently require release notes. Historical release
checks and the native revision checks pass.

Keep this plan with the feature branch/draft PR for discussion. Before merge,
reconcile every pending item, commit the completed/discarded decisions, then remove
this temporary plan in a later commit. Do not merge temporary plans. The current
task authorizes publishing the two branches as stacked draft PRs.
