# WebGPU CPU cost of retained updates

Status: CPU-focused implementation, independent review, native measurements and
applicable verification are complete. Retain this temporary plan with the draft
PR and retire it before merge.

## November 5 rebase and grouped-summary verification

Rebase the foundation onto master `5a2b42d33` and replay SampleView #660 on top.
Preserve incoming stroke-alignment, arrow composition and empty-text fixes.
Retain both plans while the PRs remain drafts.

The combined stack passes 5,595 unit tests, workspace types and lint. Native GPU
validation exposed missing ignored oracle assets and an existing picking fixture
that omitted `placement.clipToPlacement`; the six affected checks pass after
correcting setup, completing all 141 GPU checks. WebGL composition checks pass
at DPR 1 and 2. Release checks report the existing fixed-group patch release.

Native grouped SampleView testing reproduces the previously documented summary
placement failure. A one-to-many occurrence transition adds draw placement to
the Core-owned config, but Surface retains its old placement-disabled handle.
Include placement mode in the existing handle-recreation boundary, covering
unplaced, draw and instance modes without changing the renderer API or adding
invalidation state. Verify one/many/one transitions and stable ordinary updates,
then rerun real grouped summaries before recording CPU timings. This localized
Core correction belongs in the reusable foundation, rather than an App bypass.

The implemented condition adds three raw production lines (Surface 932 -> 935).
All 51 Surface/context tests, Core types, scoped lint and formatting pass. Tests
exercise the actual Core context's one/many/one transition and stable repeated
frames, plus instance-series updates versus compile-mode changes. Native grouped
summary warmups and all 12 profiler-disabled native input traces pass on the
stacked SampleView branch, with matching sample identities and no browser,
loading or rendering errors.

The new SampleView comparison is deliberately separate from the 40-heatmap
measurements below: current WebGPU versus WebGL means are 863.170 versus 881.411
ms for 384 samples/eight groups, and 970.222 versus 716.028 ms for 1,536
samples/24 groups. Both include grouped summaries and metadata. The moderate
difference is small and has mixed pairs; the stress scene uses 35.50% more
WebGPU main-thread CPU in all three pairs. These are headless native Metal
backend comparisons, not whole-PR before/after speedups. PR #660 records all
samples, input details, source identity and limits. The earlier heatmap win does
not establish that WebGPU is cheaper for every workload.

The exact real MCCA bookmark passes initial loading on both backends and the
complete WebGL interaction sequence. WebGPU still reports invalid scope bounds
during interactions, a separate failure documented on the old baseline. Record
the failing scope label and numeric dimensions before deciding whether an empty
intersection needs zero-size translation; do not silently mask NaN or add an
unconfirmed clamp. The synthetic timing evidence excludes this failing scene.

A separate 1,000-microsecond stress profile prioritizes repeated live Rectangle
and clip getter evaluation in occurrence refresh, followed by draw normalization
and command submission. These are sampled wall-time observations, not measured
CPU savings. Investigate one-time scalar materialization at the existing draw
boundary before introducing any new revision/cache protocol. No additional
performance implementation is included in this rebase/testing task.

## Native occurrence geometry follow-up

The user authorized continuing after the November 5 SampleView measurements.
Keep Core's retained frame-plan ownership and the renderer API unchanged. Start
with the independently reviewed local deletion: select each visible-range axis
from its inherited clip or occurrence coordinates before reading live Rectangle
values, instead of reading values that clipped axes overwrite. Keep
self-clipping separate, refresh after `onBeforeRender` for paint and picking,
and preserve placement-relative bounds and detached targets.

Also defer visible-range materialization until existing placement and x-index
checks accept the draw. Scissor refresh remains before placement visibility;
visible ranges feed only submitted shader commands. Move the existing code
rather than adding another early-culling pass, cache or revision state. The
independent review confirms rejected draws do not expose stale private fields;
verify offscreen-to-visible reentry with changed inherited culling bounds.

Use focused context/Surface tests and native grouped SampleView A/B wheel, pan
and closeup traces on the same WebGPU backend. Pin baseline `554723f91`, isolate
changed module sources and record a same-code A/A control. Keep a candidate only
if unsampled renderer-thread CPU improves beyond variation; otherwise retain
KISS. If the local deletion is insufficient, investigate direct scalar clipping
at the existing refresh boundary before any shared cache or geometry revision
machinery. Record all accepted and rejected measurements. Tentative delivery:
`perf(core): skip overwritten WebGPU geometry reads`.

The first deletion-only A/B completed four pairs per scene. It did not establish
a consistent gain: stress improved about 5.3% while moderate regressed on
average with mixed pairs. Retain the raw results, then test the bounded scalar
option: capture inherited clipping and the static mark clip mode on each
occurrence, remove the composed Rectangle graph and duplicate `cullClip`
reference, and intersect scalar bounds during scissor refresh. Preserve
directional clipping, `never`, signed empty scissors, full-double coordinates,
and deferred culling. This adds 17 lines to the deletion candidate, eight versus
the starting code; keep that growth only for a substantial CPU improvement
beyond a same-code control. The renderer API and layout ownership remain
unchanged.

Browser diagnosis confirms the MCCA failure starts during closeup scrolling:
`viewRoot/samples/grid_layers` has finite bounds x=286, y=85, width=1025 and
height=-105.55048641099647; `chromosome_lines` also becomes empty offscreen.
Core's clipped Rectangle intentionally allows negative empty intersections,
while renderer scopes require nonnegative sizes. Clamp width and height to zero
at `writeScopeBounds`, preserving NaN rejection and the renderer API. Extend the
existing live coalesced-scope test with empty intersections and reentry, then
rerun the real bookmark sequence. The failing baseline scene remains excluded
from performance comparisons; synthetic A/B includes both localized corrections.

#### Native comparison results

The final scalar candidate preserves the independently reviewed deferred cull
boundary and source-before-read deletion. Native Metal Chrome 156.0.8078.80 on
Apple M5 runs the same normal App input trace and grouped summary fixtures as
the November 5 comparison, with Core profiling, samplers, tracing and frame
observers disabled. Baseline `554723f91` and candidate differ only through the
isolated context module; four alternating pairs follow two warmups per version.

| Scene                    | Baseline CPU samples (ms)           | Scalar CPU samples (ms)            | Mean baseline / scalar (ms) | Change  |
| ------------------------ | ----------------------------------- | ---------------------------------- | --------------------------- | ------- |
| 384 samples, 8 groups    | 1044.769, 874.675, 758.050, 779.515 | 781.153, 683.455, 754.019, 816.468 | 864.252 / 758.774           | -12.20% |
| 1,536 samples, 24 groups | 906.817, 984.972, 929.538, 904.969  | 845.978, 801.002, 800.497, 812.442 | 931.574 / 814.980           | -12.52% |

All four stress pairs improve (-6.71%, -18.68%, -13.88%, -10.22%). Moderate
pairs are -25.23%, -21.86%, -0.53% and +4.74%; preserve that variability. All 16
traces have matching membership, counts, scroll checkpoints and settled state,
with no browser/loading errors. Initial PNGs are byte-identical per scene.
Maximum paired camera endpoint differences are 0.049% and 0.058% of the span.
These are whole renderer-main-thread CPU measurements for fixed native
wheel/pan/closeup traces, not headed cadence or GPU-time evidence.

The smaller first candidate had means 792.767 -> 848.562 ms (+7.04%) for
moderate and 977.752 -> 925.496 ms (-5.34%) for stress, with mixed pairs. It did
not justify a performance claim. Keep its raw `sampleview-geometry-final-cpu-*`
artifacts; the scalar result uses `sampleview-scalar-clip-cpu-*`. The earlier
interrupted prune attempt restored unrelated facet code while copying a
foundation file into the upper worktree; it is excluded entirely. The corrected
runs apply only the intended patch.

Final scalar source SHA-256 is
`273eb7b76ee0174bfc131c7e873d6c1f482517d7aa62c20ef326c64756522247` in the upper
worktree. Metadata records raw/served sources, optimized dependency manifest,
fixture hashes and the working package diff. The root context grows from 1,033
to 1,041 raw lines (+8).

The matching same-code control serves baseline bytes to both contexts, with
three warmed alternating pairs per scene. Preserve every sample:

| Scene    | Control A CPU samples (ms) | Control B CPU samples (ms) | Mean A / B (ms)   | Change |
| -------- | -------------------------- | -------------------------- | ----------------- | ------ |
| Moderate | 909.667, 887.828, 841.524  | 873.330, 825.783, 877.113  | 879.673 / 858.742 | -2.38% |
| Stress   | 976.446, 965.277, 951.812  | 948.544, 917.846, 921.276  | 964.512 / 929.222 | -3.66% |

Control pairs range from -6.99% to +4.23% in moderate and -4.91% to -2.86% in
stress. The context/order bias is nonzero; do not subtract it to invent an
adjusted speedup. Retain the scalar candidate because its larger mean reduction,
all four improving stress pairs, smaller clip graph and unchanged output justify
eight added lines. All 28 comparison/control traces pass correctness, identity
and settling checks; control camera differences stay below 0.143% of the span.
Control sources and initial PNGs are identical. Artifacts use
`sampleview-scalar-clip-control-*`, with the combined offline summary at
`/private/tmp/sampleview-scalar-clip-final-summary.json`.

These results apply to the two measured native headless workloads. They do not
establish a new WebGL/WebGPU gap, remove the historical SampleView architecture
tradeoff, or measure physical-display cadence or GPU execution. Reprofile the
remaining normalization/submission work before choosing another optimization; do
not add further geometry cache plumbing to this completed follow-up.

The real MCCA scalar candidate passes the complete 486-sample/seven-group
bookmark interaction sequence with zero errors, including brush changes,
threshold slider, closeup scroll and sort/filter/undo. Focused tests pass 52
cases in the foundation and 51 in the upper stack, including overlapping
directional clips and live offscreen/reentry behavior. Core types, scoped lint
and formatting pass. No renderer API changes or release fragments are needed for
this unpublished backend-only follow-up.

## Default draw and compiled scope allocation follow-up

The user authorized continuing with default rectangle reuse, followed by Core
scope container reuse. A fresh current-stack backend comparison still measured
WebGPU main-thread CPU above WebGL by 8.43% in moderate and 23.04% in stress;
all three pairs favored WebGL. Those measurements use upper head `1f76f751a`.
Start with fresh sampled attribution; keep CPU acceptance separate and
unsampled.

Renderer normalization owns one fresh canvas rectangle per call. Reuse it for
omitted viewport/scissor fields, preserving nullish default semantics, copying
and validating supplied mutable inputs every call, and keeping remembered
picking frames and detached exports independent. This introduces no public input
cache, snapshot protocol or renderer API change.

Core already compiles scope topology per layout. Allocate its private group and
child array during that compilation, then clear child arrays and refresh local
opacity during paint replay. Keep the result root and picking arrays fresh;
picking uses original commands and detached exports own another plan. Do not
retain or skip validation of public renderer inputs. Verify dynamic
zero/unity/fractional opacity, empty membership and live bounds/reentry.

Use focused renderer/context/Surface suites, package types and scoped lint.
Review both lifetimes independently, then compare native grouped moderate and
stress wheel/pan/closeup CPU on the same WebGPU backend against `1f76f751a`. Use
matching same-code controls, output/identity checks and real MCCA smoke
coverage. Prefer KISS when a larger candidate has no measurable benefit; small
growth requires a substantial measured gain. Record raw size before/after.
Tentative delivery: `perf(webgpu): reuse owned render preparation containers`.

The first combined trial is inconclusive: four pairs give moderate 932.988 ->
953.907 ms (+2.24%) and stress 951.502 -> 952.679 ms (+0.12%), with mixed paired
directions, identical initial PNGs and no errors. Keep the raw
`sampleview-owned-containers-cpu-*` results. Revert the default rectangle change
rather than retaining its extra branches without a demonstrated gain.

The first scope trial clears child arrays with `length = 0`, retaining the
wrapper but potentially discarding its storage. V8's current fast-elements
[zero-length path](https://github.com/v8/v8/blob/main/src/objects/elements.cc#L871-L872)
resets elements; this motivates an experiment, not a claim about the exact
measured binary. Test a private per-scope write cursor: overwrite accepted
entries, trim only when the child count changes at scope exit, and keep fresh
root results/picking and separate export plans. Use the existing parent stack;
add no per-push records, geometry revisions or public API. The same zero/unity/
fractional and reentry coverage must pass. Keep growth only if native CPU
measurements justify it; otherwise choose the original simpler allocation path.

The cursor trial also fails acceptance. Four pairs measure moderate 964.140 ->
945.692 ms (-1.91%, highly mixed) and stress 932.754 -> 980.242 ms (+5.09%, all
four candidate pairs higher). Both trials preserve identity, initial PNGs and
correctness, but establish no useful CPU gain. Revert all scope-container/cursor
and default-rectangle source changes, including temporary test adaptations. Keep
raw `sampleview-scope-cursor-cpu-*` evidence and the simpler existing allocation
behavior.

The fresh profile also attributes 39.8 ms inclusive sampled wall time to scope
bounds. Test a narrower deletion of work: a scope with neither clipping axis
always uses the fixed frame target bounds, so initialize that owned bounds
record from the target and skip discarded live-coordinate union reads for that
case. Keep directional/full clipping, reentry, picking and detached target
semantics. No new cache, API or retained-container protocol is involved.
Validate target ownership and focused coverage, then use native A/B before
retaining the change.

### Outcome: keep the original preparation code

The last shortcut also fails acceptance: three pairs measure moderate 873.808 ->
895.458 ms (+2.48%, mixed pairs) and stress 946.848 -> 977.092 ms (+3.19%, all
candidate pairs higher). Revert it and its temporary bounds assertion. All
production and test files are byte-identical to the previously committed
baseline; no renderer API or runtime change from this follow-up is retained. The
earlier accepted scalar-clipping change stays.

All raw CPU samples are retained below. These percentages describe the measured
trials, not proven causal regressions. Each trial was rejected before further
acceptance controls because it showed no reliable gain. All 44 timed traces pass
membership, input, settling and error checks, with identical initial PNGs. Each
candidate also passed focused tests, types, lint/format and native MCCA
interaction checks. The first combined candidate passed 23 native GPU cases.

| Trial                               | Scene    | Baseline CPU samples (ms)            | Candidate CPU samples (ms)           | Change |
| ----------------------------------- | -------- | ------------------------------------ | ------------------------------------ | ------ |
| Default rectangles + scope wrappers | Moderate | 1045.909, 917.458, 849.039, 919.548  | 893.094, 969.195, 1027.332, 926.006  | +2.24% |
| Default rectangles + scope wrappers | Stress   | 979.815, 926.201, 924.470, 975.521   | 966.105, 942.814, 964.805, 936.990   | +0.12% |
| Scope write cursor                  | Moderate | 843.348, 958.815, 1028.660, 1025.737 | 1053.526, 1052.449, 923.264, 753.527 | -1.91% |
| Scope write cursor                  | Stress   | 936.849, 907.135, 937.232, 949.801   | 989.518, 945.768, 993.287, 992.396   | +5.09% |
| Unclipped scope shortcut            | Moderate | 979.043, 815.423, 826.959            | 916.569, 963.130, 806.675            | +2.48% |
| Unclipped scope shortcut            | Stress   | 944.031, 948.636, 947.878            | 986.453, 982.966, 961.858            | +3.19% |

Artifacts under `output/sample-view-band-benchmark/` use
`sampleview-owned-containers-cpu-*`, `sampleview-scope-cursor-cpu-*` and
`sampleview-unclipped-scope-cpu-*`. The first two use four alternating pairs per
scene; the last uses three, all with two warmups, native wheel/pan/closeup and
Core profiling/samplers/observers disabled. Baseline is `1f76f751a`. The
temporary two-module A/B helper preserves canonical module identity and records
the exact raw/served source hashes; only the first trial changes renderer.js.

The fresh before-profile samples 78.2 ms inclusive wall time in renderer
normalization and 51.9 ms in GC, with 43.8 ms self time in Core replay. These
attributions motivated the experiments but did not predict application CPU
gains. An allocation-only diagnostic on the restored baseline uses CDP heap
sampling at 32 KiB, including objects collected by both minor and major GC. It
records no CPU metrics and is not acceptance evidence. Its artifact prefix is
`sampleview-current-stress-allocation-*`; allocation findings follow below.

### Allocation diagnostic and next investigation

The restored baseline completes its allocation-only stress trace without errors.
The sampled cumulative JavaScript allocation estimate is 387.32 MB (decimal),
including allocations collected during the trace. Renderer sites account for
267.39 MB (69.03%) and the Core WebGPU adapter/surface for 57.49 MB (14.84%).
These are statistical allocation estimates, not retained heap size, native/GPU
memory, CPU time or evidence of a speedup.

| Allocation site                | Estimated MB | Share of sampled estimate |
| ------------------------------ | -----------: | ------------------------: |
| Renderer `#normalizeDraw`      |       150.99 |                    38.98% |
| Renderer `#encodeDraws`        |        54.82 |                    14.15% |
| Core `#submitOccurrenceDraw`   |        26.47 |                     6.83% |
| Renderer recursive `normalize` |        18.51 |                     4.78% |
| Renderer `layerize`            |        15.60 |                     4.03% |
| Core `#render`                 |        11.97 |                     3.09% |

The normalization subtree totals 196.37 MB (50.70%); inclusive rows overlap and
must not be added. Core replay's entire subtree is 87.71 MB, including 60.76 MB
under occurrence submission, leaving at most 26.95 MB for all its other work,
including scope wrappers. `intersectRects` directly accounts for only 1.38 MB;
inlining prevents isolating default visible-range allocation from the large
`#normalizeDraw` self site. Allocation sampling uses parameters verified against
the
[official CDP HeapProfiler schema](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/json/js_protocol.json).

Prioritize renderer-owned normalized draw, viewport, placement and default-range
records, then encoder option/offset temporaries. A small shared default visible
range is a bounded candidate, but its actual CPU effect must be measured.
General normalized-record reuse needs a lifetime design for remembered color and
explicit picking frames, invalid-input boundaries and detached exports. Preserve
copying/validation of mutable public inputs; do not replace it with identity
caching or silently change snapshot semantics. Do not add a retained frame API
without the user's approval. No such optimization is implemented in this
follow-up. Keep KISS and the previously accepted scalar implementation.

## Narrow scale synchronization follow-up

The user authorized investigating precise scale synchronization within the
current renderer API. Shared GPU scale resources and bind-group grouping are
deferred to [#698](https://github.com/genome-spy/genome-spy/issues/698), including
the standalone renderer feature and Core/App integration.

Today `Mark.initializeRenderingRevisions` collapses completed scale mapping
publications into a mark-wide resource revision. `WebGpuSurface.updateMark`
then rereads every scale binding on that mark, including unrelated independent
scales. Only changed leaves reach renderer setters, but band/numeric range
readers still allocate while checking unchanged inputs.

Try guarding compiled scale updates with the existing resolution-owned
`getMappingRef()` publication. Keep the adapter's association with its source
private; do not add subscriptions, a parallel dirty registry or renderer API.
Physical scale replacement preserves this dependency identity. Keep ordinary
untracked configs on the existing read/compare path, preserve conditional
scale-dependent values, and reevaluate replaced configurations and expression
updates normally. Do not assume effective range identity follows viewport or
domain identity: schemes and rangeStep also depend on domain cardinality.

Review the source association and completed-publication semantics before source
changes. Extend real headless adapter/Surface coverage for independent scales,
navigation, reactive range changes and replacement; review existing overlapping
tests. Run focused tests, Core types and scoped lint/format, then compare native
wheel/pan/closeup CPU against upper head `0399d5d75` on moderate and stress
SampleView fixtures. Retain a candidate only for a useful measured gain, use
same-code controls if it reaches acceptance, and verify real grouped MCCA
interactions. Freeze measured sources during each run, record size and raw
results, and prefer the simpler baseline if added dispatch costs outweigh the
saved work. Tentative commit: `perf(core): narrow WebGPU scale synchronization`.

The candidate associates translated scale configs with their source mapping ref
once in `createConditionalChannel`, where Core branch aliases and scale
ownership are already resolved. Each existing compiled scale binding retains
the last completed mapping and skips its reader during scale-only updates when
that publication is unchanged. Full synchronization bypasses the guard and
refreshes its token. Non-scale values and semantic thresholds keep their
existing behavior. This is passive observation of existing graph outputs, not a
second subscription or dirty-state registry.

Raw production size changes from 3,410 to 3,447 lines (+37 across adapter and
Surface). Adapter/Surface 104 tests pass, plus 33 context/coordinator/raster
export tests, Core types and scoped lint/format. The expanded existing headless
test covers independent x/y updates, style transactions, config replacement and
physical linear-to-pow scale replacement with the same source ref. Native
acceptance uses `sampleview-scale-dispatch-cpu-*`, with the two Core modules
isolated against upper head `0399d5d75`, four alternating pairs and two warmups
per scene/version. This growth is not justified merely by the fewer source
reads established in the regression test.

### Outcome: revert the passive mapping guard

Four native pairs measure moderate 1,017.215 -> 1,060.320 ms (+4.24%, three of
four candidate pairs higher) and stress 983.843 -> 986.440 ms (+0.26%, three
small improvements followed by a larger reversal). This does not justify the
added source checks and 37 raw production lines. Revert the adapter, Surface
and temporary test extensions in both worktrees. Existing runtime and renderer
API remain unchanged. All 16 timed traces pass identity, input, settling and
error checks, and both scenes have byte-identical baseline/candidate initial
PNGs. Independent implementation review found no correctness issue. No
acceptance controls are warranted for this rejected candidate.

| Scene | Baseline CPU samples (ms) | Candidate CPU samples (ms) |
| ----- | ------------------------- | -------------------------- |
| Moderate | 816.333, 966.670, 1134.067, 1151.791 | 932.235, 956.250, 1171.700, 1181.095 |
| Stress | 998.819, 1002.421, 999.662, 934.470 | 993.600, 967.851, 996.971, 987.339 |

## Renderer placement clipping follow-up

Continue with the bounded renderer opportunity identified in the same review.
`Renderer.#normalizeDraw` still constructs a placement rectangle, a directional
clip envelope and a replacement intersection even though its initial scissor is
already renderer-owned and clipped to the canvas. Use the existing numeric
`clipMode` to intersect selected axes directly into that scissor. Preserve the
public validation and input-copy boundary, arithmetic order, unclipped axes,
empty intersections, retained picking and detached exports. Do not add object
pooling or reuse caller-owned records. Keep the normalized placement fields
delivered to custom programs unchanged.

Review the exact mutation/ownership boundary, extend existing renderer behavior
coverage only for uncovered contracts, and run focused renderer tests/types and
lint/format. Measure raw size. Then use the same native moderate/stress
interaction A/B against upper head `0399d5d75`, isolating only renderer.js.
Retain only a simpler implementation with no demonstrated CPU loss; require
substantial measured gains for growth. Use matching controls for a candidate
that reaches acceptance and native GPU/MCCA checks before delivery. Tentative
commit: `perf(webgpu): simplify placement clipping preparation`.

The candidate removes three temporary rectangles and repeated string checks,
using the already-computed numeric clipping flags. Clipped-axis operations keep
the original arithmetic association; unselected axes retain the initial
canvas-clamped scissor. Raw renderer size is 2,006 -> 2,008 lines (+2), with two
explicit axis branches instead of allocation-producing envelopes. Renderer 37
tests, renderer types and scoped lint/format pass. One focused behavior test
covers x/y/xy clipping, fractional DPR, frozen inputs, remembered picking and
empty placements. Root's independent review found no supported-input change.

### Outcome: revert scalar placement clipping

Four pairs measure moderate 1,145.142 -> 1,144.059 ms (-0.09%, mixed paired
directions) and stress 941.186 -> 986.724 ms (+4.84%, three of four candidate
pairs higher). The candidate passes 11 native Metal GPU cases for render
groups, picking coverage, mark clamping and point definitions. All 16 timed
traces have clean loading/input/identity/settling checks and byte-identical
baseline/candidate initial PNGs. Removing allocation-producing source code does
not establish that V8 or the whole interaction does less CPU work.

| Scene | Baseline CPU samples (ms) | Candidate CPU samples (ms) |
| ----- | ------------------------- | -------------------------- |
| Moderate | 1085.171, 1175.075, 1210.521, 1109.803 | 1146.274, 1138.989, 1150.569, 1140.405 |
| Stress | 987.073, 903.648, 930.804, 943.218 | 1003.143, 992.628, 1033.505, 917.621 |

Revert renderer.js and the temporary test addition in both worktrees. No
production or test change from either experiment is retained; current sources
are byte-identical to the starting runtime. Artifact prefix is
`sampleview-placement-scalar-cpu-*`, with four alternating pairs, two warmups
per scene/version and only renderer.js source isolation. These outcomes reject
the candidate without claiming a proven causal regression; no acceptance
controls are needed for a trial that showed no useful gain.

The two candidates together contribute 32 timed native traces. The first
candidate saved unrelated getter reads but added checks; the second removed
temporary rectangles but did not show useful CPU savings. Prioritizing visible
indirection or allocation estimates was insufficient. Before another change,
establish the CPU share and frequency of the exact work to remove. Empty
render-target intersection rejection remains an unimplemented candidate, not a
measured gain. Shared scale ownership/grouping stays in #698. Do not accumulate
unproven guards, pools or API changes in this PR.

## Frame-local draw handle resolution follow-up

The user authorized another small API-preserving draw-preparation experiment
after the shared-scale attribution. Keep shared resources in #698 and leave the
renderer API unchanged.

Surface currently resolves its retained mark and placement set for every
accepted occurrence. The coarse stress capture submits 531,251 ordinary draws
over 388 normal renders, plus nine picking replays. Many occurrences share one logical mark and placement
source. Earlier sampled profiles attribute about 14–15 ms self and 24–27 ms
inclusive wall time to `prepareDraw`; these are motivation, not predicted CPU
savings. `getPlacementSet` repeats source snapshot, WeakMap and revision checks
even when the same paint already resolved that source.

Replace the frame-local `updated` flag with the first accepted prepared draw. On
that occurrence, perform the existing lazy resource update and
`surface.prepareDraw`; later occurrences copy the resolved mark and placement
handles. Reset the reference at every paint/picking replay. All view hooks run
before submission, placement topology is validated by the existing owner, and
detached exports compile their own context. This adds no cross-frame validity
protocol, public input cache, pool, renderer contract or second resource owner.
Keep live occurrence geometry/ranges and original draw order.

Extend existing context/Surface coverage for multiple accepted occurrences,
offscreen-first activation, source geometry changes and handle recreation across
paints/picking. Review the implementation independently. Run focused tests, Core
types and scoped lint/format; count source size. Compare only the changed
context module against stacked head `721b33fda` using the existing
uninstrumented native moderate/stress wheel, pan and closeup driver, alternating
order and matching source/output/membership/settling checks. Use same-code
controls if a candidate reaches acceptance. Keep a change only for a repeatable
useful CPU gain; otherwise restore the simpler original path and record all
results.

This is unpublished backend work with no release impact or public migration.
Tentative delivery, if accepted:
`perf(core): resolve WebGPU draw handles once per paint`.

### Outcome: revert frame-local handle reuse

The trial passes 52 focused context/Surface tests, Core TypeScript, scoped lint
and formatting. Independent review finds no correctness issue. Production grows
1,041 -> 1,047 raw lines (+6); rewritten existing tests grow by one raw line and
assert actual submitted draws/resources instead of per-occurrence preparation
mock calls. The tests cover replacement handles across ordinary paints and
picking, plus first-occurrence rejection and reentry.

The native CPU comparison fails the acceptance gate. Four alternating pairs
after two warmups per version give the following whole renderer-main-thread
CPU in milliseconds per fixed wheel/pan/closeup trace:

| Scene | Baseline samples (ms) | Candidate samples (ms) | Mean baseline / candidate (ms) | Change |
| --- | --- | --- | --- | --- |
| Moderate | 958.214, 997.573, 816.142, 912.100 | 814.638, 932.783, 919.517, 871.650 | 921.007 / 884.647 | -3.95% |
| Stress | 1026.514, 997.096, 1005.575, 946.516 | 1034.820, 997.206, 991.904, 1049.787 | 993.925 / 1018.429 | +2.47% |

Moderate pairs vary from -14.98% to +12.67%. Stress has three higher candidate
pairs, with changes +0.81%, +0.01%, -1.36% and +10.91%. This does not establish a
useful repeatable gain or a proven causal regression. Reject the candidate
without further acceptance controls; preserve the smaller original path.

All 16 timed traces pass input movement, sample identity/grouping, loading,
closed-closeup and settling checks. Initial PNGs match byte for byte per scene;
maximum paired final camera differences are 0.0915%/0.1659% of the span.
Measurements use native Apple M5 / Metal WebGPU with Chrome 157.0.8103.39,
Core profiling/samplers/tracing/observers disabled, and only the context module
isolated against `721b33fda`. They do not measure physical display cadence or
GPU execution. No tests or concurrent browser diagnostics run during timing.

Artifacts under the upper worktree's ignored
`output/sample-view-band-benchmark/` use `sampleview-frame-handles-cpu-*`.
Metadata includes source/served hashes, driver identity, fixture membership,
input parameters and machine. The rejected production patch is retained as
`sampleview-frame-handles-trial.patch` alongside the results. Candidate source
SHA-256 is `be793d932ef5753e98d6708d6c9eb83e37bec609ad5968659ededa2623aaf315`.

Source and test changes are reverted; both worktrees are byte-identical to
their starting runtime. The renderer API is unchanged. The owned port-4173
server is stopped and the temporary private-data symlink removed. Only this
investigation record is retained; no release fragment is needed.

This completes the local optimization investigation for the current PR. Keep
the previously accepted runtime and stop adding speculative preparation
shortcuts. Six rejected local experiments total 92 timed native interaction
traces. The separate [resource-lifetime proposal](../webgpu-resource-lifetimes/webgpu-resource-lifetimes-plan.md)
and [scale attribution](../webgpu-resource-lifetimes/cpu-attribution-results.md)
record deferred directions; they do not authorize API implementation or
establish future CPU gains.

## Goal and constraints

Reduce CPU work tracking changing shader inputs and preparing their GPU updates,
using WebGL's captured evaluators and typed setters as the reference. Cover all
uniform, texture and equivalent storage-lookup inputs. Transferred bytes and GPU
utilization are not the optimization target.

Keep the current `webgpu-renderer` API: exports, declarations, handle/slot
methods, accepted inputs, immediate individual mutations, `batchUpdates`,
resource ownership and disposal. An API shortcoming must become a concrete
proposal with motivation, alternatives and migration costs; obtain explicit user
permission before implementing it. The package's unpublished status does not
waive this constraint. The user subsequently authorized the two small API
extensions below, conditional on independent review support. Other API changes
remain outside the authorized scope.

Use existing owners and dependencies. Do not add a parallel invalidation model,
input-mask registry, generic result cache or payload comparison merely to reduce
uploads. Preserve validation, live expressions, mutable inputs, physical scale
replacement, picking and export behavior.

## Starting point and correction

PR [#659](https://github.com/genome-spy/genome-spy/pull/659) supplies the
reusable foundation; SampleView
[#660](https://github.com/genome-spy/genome-spy/pull/660) stacks on its original
head. This local branch was rebased without conflicts onto `master` at
`d8547c2a9`, producing `a0493a255`; all six original commits remained
patch-equivalent. The original head is retained on
`codex/webgpu-retained-updates-before-rebase-20261104`. No dependent branch or
remote PR has been rewritten.

The reviewed continuation plan was committed as `47120aacc`. Commit `26da369de`
then added unchanged-payload comparisons for occurrence globals, composite
opacity, palettes and scale tables. That selected the wrong target: it reduced
uploads while adding CPU work, and the small Core trace used 3.4% more CPU.
Those runtime guards and their guard-specific tests are removed in this
correction. The old transfer measurements remain in Git history; they are not
acceptance for this work.

The original foundation's compiled uniform writers, scale-only binding subset,
immutable-domain reuse, effective categorical ranges and placement fixes remain.
Their historical microbenchmarks do not establish whole-application speedups.

## Architecture and measured causes

Start at [ARCHITECTURE.md](../../ARCHITECTURE.md), Core's
[rendering architecture](../../packages/core/docs/architecture/rendering.md) and
[reactivity architecture](../../packages/core/docs/architecture/reactivity.md).

Core owns expressions, completed mapping producers, revisions and translation.
The renderer owns input validation, fixed layouts, typed writers, GPU resources
and uploads. Only documented renderer entry points cross the adapter boundary.
The WebGL reference is `webGlMark.js`: compile property evaluators and uniform
setters once, then invoke them when their producers change.

The CPU investigation identified these repeated costs:

- `readProperty` called
  `resolveMarkProperty → evaluateAndGet → createExpression` during resource
  reads. This recompiles and binds the expression on every read; it is not a
  cached lookup. The same property already has a subscribed evaluator from
  `Mark.initializeRenderingRevisions`.
- Band viewport reads called the public scale getter, validating and copying an
  owned snapshot, before Surface recursively compared and copied it again.
  `ScaleResolution.getMappingRef()` already owns the completed snapshot and
  survives physical scale replacement and supported imperative setters.
- Revision getters repeated initialization bookkeeping, and resource sync
  recomputed program keys even when Core retained the same structural config.
- Renderer scale updates repeated fixed routing, gap-state lookups, uniform-name
  construction and uniform-writer lookup.

A native CPU profile of 32 marks sharing a 1,024-category band scale confirms
`deepEqual`, `snapshotValue`, viewport copying/normalization and uniform writer
work in the WebGPU path. A separate changing-style workload exposes repeated
expression compilation. Profiling is diagnostic; acceptance uses separate runs
without the application profiler or CPU sampler.

## Implementation milestones

### 1. Reuse the existing expression and mapping owners

- [x] Replace the existing Mark expression Set with a Map containing the exact
      evaluator returned by each existing `watchExpression`. No extra evaluator,
      subscription, result cache or disposal owner is introduced.
- [x] Evaluate retained properties through that canonical Map. Move existing
      text/link/arrow property setup before initial reads; keep the same watched
      declarations and fail immediately if a supported resource read was not
      initialized. Revision getters become pure reads.
- [x] Read the resolution-owned completed viewport snapshot instead of cloning
      the public scale getter result. Preserve direct scale setters, resource
      revision notifications and band-to-point physical replacement.

Affected files: Core `marks/mark.js` and
`rendering/webgpu/webGpuMarkAdapter.js`. Verification uses real headless
rect/arrow/text scalar and vector parameter updates, confirms zero expression
compilation during retained property reads, and extends existing
mapping/replacement coverage. There is no public renderer API or documentation
migration.

### 2. Simplify existing comparison and setter dispatch

- [x] Reuse the retained program key while definition and Core-owned structural
      config identity remain unchanged; replacement still recomputes it.
- [x] Use Core-owned viewport publications directly. The continued
      simplification below removes the intermediate fixed-shape viewport
      comparison/copy helpers and all duplicate private Surface snapshots.
- [x] Capture gap state and its uniform writer once; choose plain/band/gapped
      domain publication once and use the already captured continuous-domain
      writer. Keep renderer boundary validation and viewport detachment intact.
- [x] Remove the extra global/composite/table/palette payload scans from
      `26da369de`; retain straightforward packing/upload paths.

Affected files: Core `webGpuSurface.js` and renderer `scaleResources.js`, plus
the reverted upload-guard files. Existing tests cover config replacement,
producer-owned inputs, public mutable renderer inputs, null/rank transitions,
live/picking/export behavior, exact gaps, growth and disposal. No new routing
framework or renderer API is needed.

### 3. Verify CPU benefit and integration

- [x] Compare continuously changing inputs against the pre-guard WebGPU
      foundation (`47120aacc`) and WebGL, with warmed alternating runs, the same
      data/input trace, native hardware and profiling disabled.
- [x] Compare the first scale-only candidate with both previous WebGPU
      revisions; distinguish update-call timing, whole-thread CPU and sampler
      attribution.
- [x] Finish the original small-heatmap control after the evaluator correction.
- [x] Run renderer and affected Core subsystem tests, Core/renderer types,
      scoped lint/format, representative native GPU/public Core cases and
      release checks.
- [x] Review changed ownership/contracts independently. The first review found
      an initial frozen-tuple aliasing issue; snapshot initialization was
      corrected and the existing viewport regression extended. The
      evaluator/initialization review found no actionable issue.

Tentative implementation commit:
`perf(webgpu): reduce CPU work in retained input updates`.

## Complete input-data audit

| Input class                             | Current disposition                                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Expression-backed styles/properties     | Reuse subscribed evaluators; no per-read parse/codegen/binding                                                          |
| Numeric/color channel values            | Existing compiled encoders and retained setters; no added payload guards                                                |
| Scale domains/ranges/viewports/gaps     | Existing change filtering plus native mapping snapshots, producer-owned viewport identity and captured renderer writers |
| Selection uniforms/hash tables          | Existing Core change filtering and renderer capacity reuse; no new cache/sharing contract                               |
| Palettes/ordinal/domain/cut tables      | Normalize on dispatched updates; Core already filters unchanged leaves; callable palettes and mutable ranges stay live  |
| Occurrence globals/composite opacity    | Straightforward packing/upload restored; no extra CPU scan to save transfers                                            |
| Placement/text lookup buffers           | Existing topology/geometry/series revision updates and capacity reuse                                                   |
| Font/path atlases and generation inputs | Existing shared/append-only atlas and retained scratch resources; no redraw-time generation added                       |
| Dash textures                           | Initialization-only build/upload; per-mark sharing deferred without a creation-heavy CPU workload                       |

Additional shared preparation, more granular notifications, uniform dirty spans,
shader specialization and explicit identical-input guards are deferred. Do not
revive the earlier discarded grouped-mapping/input-mask experiment without a
measured CPU benefit and a simpler ownership model. These are not incomplete
implementation tasks for this correction.

## Native CPU measurements

Headed Chrome on an Apple Metal-3 adapter, DPR 1, with no concurrent heavy
checks. The test embeds Core through its public API. Each synthetic scene has 32
rect marks, 1,024 rows, a shared band viewport and palette; 60 warmup frames
precede 120 measured updates. Baseline module substitution includes Core Mark,
Surface, adapter and changed renderer modules, avoiding mixed-version
attribution. Temporary drivers/profiles/PNG captures and raw reports are in
ignored `output/webgpu-change-tracking/`; no permanent benchmark framework is
added.

The scale-only experiment uses five alternating rounds. The first corrected
candidate reduces mean synchronous update/render-call CPU from 0.872 to 0.774 ms
(11.2%) and whole-thread task CPU from 205.51 to 195.11 ms (5.1%) against the
foundation. Whole-thread comparisons against `26da369de` vary, including one
large favorable outlier for that older commit; no universal speed claim follows.
All three WebGPU versions produce byte-identical PNG output.

The style-plus-scale experiment changes five expression-backed style properties
as well as the viewport on every frame, using three alternating rounds. Its
compiled evaluator correction is included:

| Backend/version   | Mean renderer-thread task CPU per 120 updates | Mean synchronous update/render call | Mean p95 call |
| ----------------- | --------------------------------------------: | ----------------------------------: | ------------: |
| WebGL             |                                     213.30 ms |                            0.777 ms |       1.10 ms |
| WebGPU foundation |                                     589.64 ms |                            4.153 ms |       5.30 ms |
| Corrected WebGPU  |                                     228.98 ms |                            1.098 ms |       1.50 ms |

Corrected WebGPU uses 61.2% less whole-thread CPU than the foundation in this
workload; paired reductions are 63.4%, 59.4% and 60.6%. The update/render call
is 73.6% cheaper. Corrected total CPU is about 7.4% above WebGL here; this does
not establish parity for every application. Baseline and corrected WebGPU PNGs
are byte-identical. Headless regression coverage confirms that retained property
reads compile zero new expressions while still observing changed scalar/vector
values.

The original public clustered-heatmap example was also rechecked after the full
correction, in a 1,100×650 container using three alternating pairs of 120
viewport updates. Mean thread CPU was 164.13 ms for the foundation and 160.53 ms
corrected (−2.2%, mixed pair signs); this small difference is within normal
variation. Mean synchronous calls were 0.483 versus 0.445 ms. Before/after PNGs
are byte-identical, and the earlier +3.4% observation does not recur in this
control.

## Final verification and size

- 530 focused tests pass across the renderer, Core marks, WebGPU integration and
  affected scale-owner suites.
- Eight native GPU tests pass for placement/clamping, conditional ordering and
  picking, render groups and scale-table relocation/membership.
- Both package TypeScript checks, scoped ESLint/Prettier and release checks
  pass; no package is scheduled for a version bump.
- Independent source review found no outstanding correctness or API issue. The
  frozen-initial-tuple finding was fixed and covered before final checks.
- Public renderer declarations and entry points are unchanged. Direct mutations,
  batching, scope disposal and resource ownership remain intact.

The first CPU correction grew six runtime files by 93 raw lines against the
foundation. That intermediate size is superseded by the continued simplification
below, whose hard gate is no production SLOC growth. Existing real headless
tests protect zero recompilation during retained reads; guard-specific upload
tests were removed.

## Delivery and remaining coordination

This work is private WebGPU integration/internal Core plumbing and adds no
released API or grammar behavior. Keep the empty
`.changeset/webgpu-retained-input-data.md` as the no-release record; no package
version bump is intended. The branch inherits master 1.3.0, not a queued 1.3.0
release.

Keep the reconciled plan for the draft PR. Before merge, commit the completed
and explicitly deferred decisions, then remove the temporary plan in a later
commit. The following remain delivery work rather than reasons to add
implementation:

- Coordinate #660's rebase onto the new foundation, replaying only its consumer
  delta and accounting for changes already landed on master. Its old-head exact-
  tree comparison is historical, not a requirement to undo master changes.
- If that consumer is rebuilt, repeat its SampleView navigation, sort/filter/
  undo, alignment and picking checks; preserve its known WebGPU grouped-summary
  limitation instead of claiming it fixed here.
- Update remote PR validation/measurement claims when publishing; merge #659
  first and retarget #660 afterward. No remote writes or merges have been
  performed.

## Continued simplification: producer-owned inputs

The next acceptance baseline is `d8e083bb7`. The public renderer API remains
fixed. Runtime production SLOC must not increase, and native measured CPU must
not regress. Remove duplicate private Surface snapshots and unnecessary renderer
setter plumbing; keep boundary validation and caller-input detachment.

Core's completed mapping owns domain, viewport and grouping-gap publications.
Resource expression getters return computed numeric/color values. The
intermediate correction detached the large-index pair and link-distance outputs.
The final continuation below removes that need for mutable uniforms by consuming
them synchronously. Private Surface fake config mutation is not a new public
contract. Preserve actual parameter/scale updates, config replacement,
export/live transitions, selections and disposal. Do not add another
subscription registry or input-mask system.

Independent design review identified two constraints: configured ranges can be
new but semantically unchanged on navigation, and adapter getters can close over
a physical scale. Any producer-based skipping must account for both; retain
existing semantic filtering where identity alone is insufficient.

- [x] Delete `equalViewports`, `snapshotViewport`, `snapshotValue`, frozen-array
      inspection and per-binding copy policies. Retain Core-owned/computed
      results; adopt equal new results once during config compilation, not on
      every update.
- [x] Retain interval-selection publications directly; inspect component pairs
      only on new publications, preserving quiet equal updates without tuple
      copies.
- [x] Specialize literal numeric/shadow properties through the existing constant
      path, remove duplicate retained-value wrappers and merge numeric readers.
- [x] Collapse renderer-internal viewport and selection dispatch while retaining
      the existing public validation and mutation behavior.
- [x] Review and simplify private implementation tests; verify real producer and
      renderer contracts with existing focused coverage.
- [x] Compare native CPU and byte-identical output with `d8e083bb7` in
      scale-only, style-plus-scale and real heatmap traces. Keep only
      non-regressing changes.
- [x] Verify types, focused tests/GPU checks, independent review, release impact
      and exact runtime SLOC before committing.

Independent implementation review found and fixed one vector-validation issue:
copy the full link-distance array so malformed live lengths still reach renderer
validation. A real headless layered point/link test protects both mutable-vector
producer exceptions. Static literal specialization and all renderer-internal
changes preserve the current public API.

Focused verification: 531 tests in 55 files and eight native GPU tests pass.
Scoped ESLint and release policy/status checks pass; unpublished WebGPU work
still uses the existing empty no-release changeset. Final types, CPU and size
gates are recorded below when complete.

### Continued CPU and size results

Six alternating pairs per scene keep the baseline and candidate embeds alive,
after 180 warmup frames each, and alternate foreground measurement order. Each
sample measures 120 updates. Both versions substitute the same changed-module
paths, using baseline `d8e083bb7` versus the candidate source. Headed native
Chrome uses Metal; context DPR is emulated as 1, while the display's physical
content-box measurement supplies a 2× backing canvas. No CPU sampler or
application profiler is enabled during acceptance runs.

| Workload                   | Baseline thread CPU | Candidate thread CPU | Change | Synchronous update/render change |
| -------------------------- | ------------------: | -------------------: | -----: | -------------------------------: |
| Style plus scale, 32 marks |           255.34 ms |            227.82 ms | −10.8% |                           −12.4% |
| Scale only, 32 marks       |           225.35 ms |            212.94 ms |  −5.5% |                            −3.0% |
| Real clustered heatmap     |           176.72 ms |            174.73 ms |  −1.1% |                            −0.5% |

All six style pairs favor the candidate. Scale-only pairs have mixed signs,
although five of six favor it. Heatmap differences have mixed signs and are
within ordinary variation; claim no heatmap speedup. Early, shorter runs were
noisy and one heatmap control was a few percent slower; removing unconditional
retained-state assignments resolved the avoidable work. Keep the raw earlier
results in ignored output, rather than dropping unfavorable samples.

A separate diagnostic wraps the exact served Surface modules: each heatmap
sample calls `updateMark` 600 times and makes 1,160 retained writes in both
versions. Mean measured update-block time falls from 16.90 to 14.33 ms. This
instrumented result explains work reduction; acceptance uses the uninstrumented
measurements above. All three baseline/candidate exported PNG pairs are byte
identical, with no page errors. Temporary drivers/results remain under ignored
`output/webgpu-snapshot-removal/`; no benchmark framework was added.

The six changed runtime files shrink by 184 raw lines (6,676 → 6,492), before
excluding comments and blank lines. Exact parser-based JavaScript counts under
`packages/`, excluding tests/declarations, are 120 added and 268 deleted: **−148
production lines** against `d8e083bb7`. Including tests gives 261 added and 364
deleted (**−103**). The cumulative branch against `origin/master` is 434 added
and 501 deleted (**−67 production lines**), so both comparisons meet the size
gate. No declaration files changed. Both Core/renderer type checks, scoped
lint/format, independent final review, 531 focused tests, eight native GPU tests
and release checks pass. There is no public renderer API change or
released-package version bump.

## Direct uniform consumption and captured evaluators

Baseline: `071c5708d`. The renderer API remains fixed. The user permits a small
SLOC increase when it unlocks substantial measured gains. CPU must not regress;
allocation/GC diagnostics are separate from profiler-disabled CPU acceptance.

### Completed design

- [x] Keep the flat retained-binding loop and its cheap scalar filtering.
      Dynamic uniform vectors always reach synchronous typed setters; their
      previous borrowed references never suppress an update. Scale/table and
      owned immutable geometry values retain semantic change filtering.
- [x] Reuse packed-index and numeric-vector scratch; pass native link-distance
      arrays directly. Delete per-read detached uniform-vector outputs and whole
      corner-radius objects. Text viewport geometry uses one owned array per
      translated config, refreshed by existing numeric-geometry invalidation.
- [x] Expose the exact existing subscribed property evaluator from Mark and
      capture it once in numeric, semantic and vector readers. Common corner
      fallbacks call the captured base-radius evaluator directly. There are no
      extra subscriptions, result caches or lifecycle owners.
- [x] Delete redundant continuous-domain normalizer envelopes and
      packed-interval intermediates. Pack high-precision integers directly into
      existing storage, deleting the intermediate split pairs and duplicate
      packing loop.
- [x] Honor already-declared packed input components in dynamic uniform storage.
      A real native HP datum exposed the existing scalar-layout initialization
      failure. Typed-memory unit and native rendering/picking regressions now
      cover this API contract; no public declaration or method changed.
- [x] Replace the private getter-ownership test with real adapter-to-slot typed
      memory behavior. Remove the fake live-leaf case now covered by real native
      parameter/scale tests. Retain scalar validation after failed setters.

Grouped source dispatch and setter-keyed scalar caches were measured and
rejected: the style workload used about 10% more thread CPU despite allocating
less. Source-reference grouping and additional routing state are discarded.
Capturing producers while retaining the flat loop is the final design.

Independent final review found no outstanding ownership or API issue. Earlier
review findings about publishing state before failed setters and suppressing
undefined-property validation were addressed; the retained flat loop publishes
comparison state only after a successful setter.

### Final native measurements

Temporary drivers, source hashes, profiles, traces and PNGs are under ignored
`output/webgpu-direct-uniforms/`. All JavaScript module timestamp queries are
normalized consistently during source substitution so Core's module-local
metadata retains one identity. Rejected candidates and failures remain recorded.
No permanent benchmark framework was added.

CPU acceptance uses explicit CDP `threadTicks`/`ThreadTime`, separate from
allocation/CPU sampling. Each synthetic scene has 32 marks. Three alternating
pairs each measure 600 updates after 600 warmup updates for style and 360 for
vectors. Heap collections before/after the interval are timed separately; none
is forced inside the interaction interval. All exported PNG pairs are
byte-identical, and no page/loading errors were reported.

| Workload                         | Baseline thread CPU per 600 updates |   Candidate | Change |
| -------------------------------- | ----------------------------------: | ----------: | -----: |
| Style plus scale                 |                         1,386.05 ms | 1,338.62 ms | −3.42% |
| HP datum/link vectors plus scale |                           868.72 ms |   877.73 ms | +1.04% |
| Real clustered heatmap           |                           846.98 ms |   850.02 ms | +0.36% |

Pair variation is substantial. These results support roughly unchanged whole
renderer-thread CPU, not a reliable application-wide speedup. The HP vector
baseline needs the same isolated input-layout correctness fix before it can
render; the driver records this common fix and both original/effective hashes.
The untouched baseline failure is preserved explicitly.

Two alternating allocation-sampling pairs per workload include objects collected
by minor/major GC. Sampling interval is 4,096 bytes; values are statistical
allocation estimates, not exact allocation counts or retained heap sizes.

| Workload              | Baseline sampled allocation | Candidate |  Change |
| --------------------- | --------------------------: | --------: | ------: |
| Style plus scale      |                    80.58 MB |  65.87 MB | −18.25% |
| HP datum/link vectors |                    71.88 MB |  72.46 MB |  +0.81% |

Both style pairs agree (−18.39%, −18.11%). Adapter-attributed style allocations
fall from 20.16 to 5.36 MB. Vector totals and GC timing are mixed; claim no
overall vector-allocation or GC-time improvement. Mean main-thread GC union
times are 26.53→25.16 ms for style and 27.28→30.96 ms for vectors. Traces clip
the interaction window and merge overlapping intervals rather than double-count
nested phases.

A separate final 100 µs CPU-sampling diagnostic attributes 55.67→41.32 ms to the
`updateMark` subtree (−25.8%) over one 360-update pair. This supports reduced
update-preparation work, not a whole-application speedup; the acceptance numbers
above have no CPU sampler enabled.

### Verification and delivery

- 530 focused tests across 55 files and 14 GPU tests pass, including the new
  packed-value rendering, movement and picking regression.
- Core/renderer TypeScript, scoped lint/format and release checks pass.
- This remains unpublished WebGPU/internal Core work. Reuse the empty changeset;
  no released package is scheduled for a version bump.
- Parser-based JavaScript counts under `packages/`, excluding
  tests/declarations, add 138 and delete 132 lines against `071c5708d`: **+6
  production lines**. Across the continued cleanup against `d8e083bb7`,
  production is **−142 lines** (238 added, 380 deleted), or **−18 including
  tests** (529 added, 547 deleted). The full branch is **−61 production lines**
  against `origin/master`.
- The renderer's public declarations and slot timing are unchanged.

## Authorized API extension: typed vectors and uniform input consumption

The user authorized implementation if an independent subagent supported two
proposals: accept numeric typed vectors, and document immediate consumption so
callers can reuse scratch buffers. Review supports both with the boundary below.

The renderer owns numeric value types, shader literals, validation and uniform
storage. Extend the existing numeric value contract across initial channel
values, defaults, conditional literals, retained value slots and custom extra
uniforms; preserve scalar-only, scale and semantic-property input contracts.
Exclude `DataView` and BigInt typed arrays. This is an additive public type
extension; callers using existing numeric arrays need no migration.

Successful uniform setters consume numeric elements into renderer-owned storage
before returning, including within `batchUpdates`. This documents the existing
synchronous packing behavior; batching coalesces uploads and binding work. The
promise covers value slots, extra-uniform slots and built-in uniform-backed
properties. Configurations, series and scale-resource inputs are separate:
configs/series retain source references, and gap ranks can be retained for later
scale updates. No new general ownership promise applies to them.

Core's large-index adapter can return the packed `Uint32Array` directly,
deleting its intermediate plain array and component copies. Surface compares
only primitive uniform values for equality; mutable vectors always reach the
setter even when their storage identity is unchanged. No new subscriptions,
resource owners, update registry or per-update allocation is needed. Static WGSL
generation and text/rule decisions must recognize typed vectors too.

- [x] Independent review supports the scoped contract and identifies retained
      scale/config references as an ownership boundary.
- [x] Implement consistent numeric value types and existing runtime consumers.
- [x] Consume the packed buffer directly in Core and preserve mutable updates.
- [x] Document accepted values, successful-call timing and batching semantics.
- [x] Verify representative static/conditional, exact-u32 and scratch reuse
      behavior, including native rendering and picking.
- [x] Review the final integrated diff, types, lint, release impact and size;
      commit the coherent extension.

Commit: `perf(webgpu): accept typed uniform vectors directly`

Verification covers 487 renderer/Core WebGPU tests across 53 files and 14 native
GPU checks. Both package TypeScript checks and scoped ESLint pass. The existing
mutable point/link integration test exercises repeated writes from the same
packed typed buffer; renderer tests verify exact u32 words from subarrays,
independent batched vector writes, and built-in property/extra-uniform scratch
reuse. Static/conditional literal, ordinal-scalar, text-alpha and dash-index
cases retain their prior semantics with numeric typed inputs.

This extension removes one adapter scratch array and its two component copies.
It adds no uniform-setter work and makes no new end-to-end CPU speedup claim;
the native CPU measurements above apply to the preceding commit. Release
policy/status checks pass with the existing empty changeset and no version bump.

Independent final review found no remaining contract or correctness issue. Its
KISS finding removed a redundant constructor container-validation loop: static
literals, dynamic uniform packing and conditions already validate effective
inputs. The final runtime delta is 57 added and 33 deleted raw lines (**+24**,
including comments and blank lines), plus **+16** declaration lines, against
`7ed682f83`. The existing uniform writer is unchanged; added type/container
handling runs during mark construction and shader assembly.

## Next opportunities: remove obsolete adapter work

Baseline: `d0dff3b5b`. Read-only investigation identified the following ranked
opportunities. The user first authorized **1 and 2**, then authorized **3 and
4**, followed by a commit, and **5** afterward. Most of the original 2,645-line
adapter builds configurations or extracts columns; file splitting alone would
not reduce retained-update CPU work.

1. **Remove obsolete per-channel view opacity (authorized).** The only
   production caller in `webGpuViewRenderingContext.js` passes `1` to
   `createWebGpuMarkConfig`. View scopes already own local opacity, and
   effective opacity controls culling. Delete the adapter argument, six-builder
   plumbing, opacity-specific channel/branch helpers and nonpositional range
   multipliers. Use the existing numeric channel path and simplify rect shadow
   opacity to its mark property. This also removes literal-opacity dynamic slots
   and synthetic scales for unscaled opacity series. Preserve nested group
   opacity, mark opacity, conditional/scaled inputs, shadows, picking and
   export.
2. **Remove duplicate palette normalization (authorized).** Threshold/quantize
   scale getters currently convert CSS palettes to RGBA before Surface compares
   their contents. Forward the raw range and delete `normalizeColorRange`.
   Renderer output components come from channel metadata. Threshold already
   normalizes CSS colors on actual writes; independent implementation review
   found that quantize's continuous-stop resource route instead packs strings
   directly. Route quantize color stops through the renderer's existing color
   normalizer on actual writes, preserving scalar fast paths and one-entry
   ranges. Keep palette updates live. Invalid-color errors will come from the
   renderer's native validation rather than Core's per-read conversion; do not
   add another polling validator merely to preserve error wording.
3. **Classify remaining literal properties (authorized).** Point `inwardStroke`,
   rule cap/alignment and property-backed glyph offsets remain live when
   literal. Existing static/live property helpers could avoid these bindings,
   mainly during style updates; scale-only updates already skip them. No new
   cache or subscription registry is justified.
4. **Remove small renderer allocations (authorized).** Reuse scale-owned scratch
   for the four-number gap-geometry write and pass packed interval-selection
   typed output directly instead of copying through `Array.from`. Preserve
   complete selection validation before writes, public input detachment and
   scale/config ownership boundaries.
5. **Profile draw preparation for larger gains (after the 3–4 commit).**
   Previous allocation samples attribute roughly 20 MB of 66 MB to normalization
   and related helpers. Draw clipping creates three temporary rectangles per
   encoded draw; scalar clipping/physical conversion is a bounded candidate
   before whole-frame reuse. Preserve target origins, fractional-DPR rounding
   and retained picking-frame lifetimes. Disabled-profiler callbacks are another
   diagnostic lead, not a proven source of all allocations attributed to their
   caller.

Band/ordinal `scale.range().map(...)` allocations remain a separate ownership
question. Surface retains previous range values for semantic equality, so
mutating one shared scratch range can hide updates. Mapping configuration range
is not always the effective range for generated schemes or range steps. Do not
replace those getters with mutable scratch in this change. Earlier source
routing/caches and payload scans remain rejected.

### Architecture and implementation gate

Core owns grammar translation and mark opacity. Renderer semantic groups own
view opacity composition; renderer discrete scale resources own CSS palette
normalization. Reuse those existing owners, numeric channel construction and
public renderer APIs. The removed adapter argument is private Core plumbing;
renderer declarations, handles and ownership contracts are unchanged. No new
subscriptions, caches or retained state are needed. The existing real group
opacity test and neighboring rect shadow/conditional paint paths provide
composition coverage beyond a single point demo.

- [x] Delete the obsolete opacity path and update its sole production caller.
- [x] Forward threshold/quantize ranges and delete duplicate normalization;
      normalize quantize CSS stops at the renderer-owned write boundary.
- [x] Reconcile private adapter tests with actual group and mark contracts;
      verify live/scaled opacity, raw/transparent palettes and retained updates.
- [x] Verify native rendering/picking and representative retained interactions,
      types, focused tests, lint, release impact and source size.
- [x] Independently review the integrated implementation, address worthwhile
      findings and commit the two authorized deletions together.

Commit: `perf(webgpu): remove obsolete opacity and palette work`

This remains unpublished WebGPU/internal Core work with the existing empty
changeset and no package version bump. Keep this plan on the draft branch and
retire it before merge. The next authorized stages are recorded below.

### Completed deletion verification

The adapter shrinks from 2,645 to 2,469 raw lines. The production caller loses
one line; renderer-owned quantize normalization adds 12. Combined runtime size
falls by **165 raw lines** (43 added, 208 deleted, including comments/blanks).
No public renderer declaration changes. The complete boundary tests now include
real headless conditional/scaled/unscaled mark-opacity updates and actual
threshold/quantize uniform storage for initial and retained transparent CSS
palettes. Obsolete tests of arbitrary private adapter view-opacity arguments
were removed. Independent final review found no remaining correctness or KISS
blocker after the quantize route correction.

Verification: 488 focused renderer/Core WebGPU tests across 53 files, both
package TypeScript checks, scoped lint/format and 14 native GPU checks pass.
Release policy/status checks retain the existing empty changeset and no package
version bump.

Existing temporary native Chrome/Metal drivers compare `d0dff3b5b` with the
candidate, substituting all three changed runtime modules consistently. Each
sample measures 600 style-plus-band-viewport updates on 32 marks. Application
profiling, CPU sampling and tracing are disabled for acceptance. GC runs only
outside the measured windows. All exported PNG pairs are byte-identical, with no
browser/loading errors. The palette variant also uses nested view opacity,
expression-backed mark opacity, shadows and live quantize CSS palette changes;
its datum-backed picking results match before/after.

| Run                        | Warmup updates | Alternating pairs | Baseline thread CPU | Candidate thread CPU | Change |
| -------------------------- | -------------: | ----------------: | ------------------: | -------------------: | -----: |
| Initial style              |            360 |                 3 |         1,103.18 ms |          1,149.77 ms | +4.22% |
| Same-code style control    |            600 |                 3 |         1,235.13 ms |          1,236.59 ms | +0.12% |
| Longer style repeat        |            600 |                 6 |         1,311.86 ms |          1,223.75 ms | −6.72% |
| Palette and nested opacity |            600 |                 3 |         1,892.76 ms |          1,861.72 ms | −1.64% |

The initial slower observation triggered a separate diagnostic, same-code
control and longer repeat without source changes. All six repeat pairs favor the
candidate; palette pairs have mixed signs. Timing varies materially across runs,
so these measurements do not establish a general CPU speedup or a reproducible
regression. The accepted implementation deletes known repeated work without
introducing a tracking layer. Keep the unfavorable initial run and instrumented
diagnostic with the final results under ignored
`output/webgpu-direct-uniforms/adapter-deletions-*`; temporary drivers remain in
`/private/tmp`. No permanent benchmark framework was added.

## Literal property and renderer allocation cleanup (3–4)

Baseline: `0584e6bfb`. Implement these two bounded changes and commit them
before starting draw-preparation work. Renderer public APIs, validation and
caller input ownership remain fixed.

Core already distinguishes literal and expression-backed numeric properties.
Reuse those helpers for point inward stroke, rule stroke alignment/caps and
property-backed glyph offsets. Literal values need no retained uniform binding;
expressions retain their existing subscribed evaluator. Keep channel-backed
`dx`/`dy`, fallback semantics and contextual validation intact. Do not introduce
another property classification system or cache.

Gap state already owns its captured uniform writer. One private four-number
scratch vector can serve every geometry write because packing is synchronous,
including inside batches. It is unrelated to public viewport/range ownership.
For packed selection intervals, pass the packer's fresh typed vector directly to
the existing writer. Retain preparation of all components before any writes and
retain ordinary interval detachment; those protect the existing failure
boundary.

- [x] Classify the remaining literal properties and cover real expression
      updates.
- [x] Reuse gap geometry scratch and remove the redundant packed-selection copy.
- [x] Verify focused behavior, renderer/Core types, native rendering/picking,
      lint, release impact, source size and independent implementation review.
- [x] Commit 3–4 as `perf(webgpu): trim literal slots and update allocations`.

Verification passes 488 focused tests, both package TypeScript checks, scoped
lint/format and 14 native GPU checks. Existing headless property coverage now
exercises live point/rule expressions and glyph channel branches alongside
literal offsets/defaults. Renderer coverage writes packed intervals into real
uniform memory, rejects a malformed later component before any write, and checks
independent gap state across scale updates. Final independent review found no
blocker. The runtime delta is **+9 raw lines** (23 added, 14 deleted); this
replaces repeated evaluation/allocation without adding a framework. No new
whole-renderer CPU gain is claimed for this bounded cleanup. Release checks
retain the existing empty changeset and no version bump.

## Draw preparation follow-up (5)

Start only after the 3–4 commit. Profile the resulting committed implementation
with the existing native scene/driver, keeping CPU acceptance separate from
allocation sampling. Recheck current attribution rather than treating the older
20 MB allocation estimate as current evidence.

Prefer bounded removal of transient clipping rectangles and repeated
normalization over whole-frame pooling or new invalidation machinery. Preserve
fractional-DPR floor/ceil behavior, offscreen target origins, input validation,
picking-frame lifetimes and detached exports. The renderer retains normalized
frames, and bind-group state retains dynamic-offset array references; neither
can be replaced with arbitrary mutable shared scratch. A larger ownership/API
change remains a proposal requiring user permission.

If fresh evidence supports a local change, implement it through the current
renderer boundary, verify the affected clipping/group/picking contracts and
compare native CPU and output. Inspect disabled-profiler callbacks only when
current attribution supports them; caller-attributed allocation alone does not
prove closure volume or CPU cost. Keep only coherent changes with useful
allocation/work reduction and no reproducible CPU regression.

- [x] Profile current draw preparation and identify the smallest justified
      change.
- [x] Implement justified local simplification with representative regression
      coverage.
- [x] Verify native output, picking/export and profiler-disabled CPU; review and
      record the outcome and source delta before delivery.

Baseline for 5: `c322a6e16`, the completed 3–4 commit. Two fresh allocation
samples of 600 updates on that commit attribute about 24 MB of 63 MB to renderer
draw preparation. Within draw encoding, intersection and physical-scissor
helpers account for about 3.3 MB. This confirms a bounded target on the current
implementation rather than relying on the older profile.

The implementation hoists target bounds and floored physical origins once per
draw pass, then computes each scissor with scalar locals. It removes three
temporary rectangles and redundant validation of already-normalized internal
scissors. Logical intersection width/height is still computed before physical
rounding, with the exact former arithmetic association and absolute-origin
floor/ceil order. Group helpers, remembered draw frames, custom draw options and
dynamic-offset arrays retain their existing ownership. The runtime grows by 11
raw lines; no state, pool, cache or API is added.

Existing tests now cover outward fractional-DPR clipping on detached targets,
nonzero rounded group origins and retained flat picking coordinates. The native
overlap scene uses a nonzero group origin with its prior expected pixel values.
Independent implementation/test review found no blocker.

Two alternating allocation pairs against the committed baseline reduce sampled
allocation from 63.98 to 60.94 MB (**−4.76%**). Both pairs favor the candidate.
The draw-encoding subtree falls from about 6.06 to 3.21 MB (**−47%**);
attribution can move between inlined callers, so this is a sampled estimate, not
an exact object/byte count. These diagnostics include collected objects and run
separately from profiler-disabled CPU acceptance. Exported PNGs are byte
identical with no browser/loading errors. Artifacts are under ignored
`output/webgpu-direct-uniforms/draw-preparation-*`; no permanent harness is
added.

Final correctness checks pass 488 focused tests, renderer TypeScript, scoped
lint/format, release checks and 14 native GPU tests. Core types passed for the
preceding 3–4 commit; no Core source changes in 5. Fractional-DPR export and
group origin/picking tests pass, and all native PNG pairs are byte-identical.
The public renderer API and remembered-frame ownership are unchanged. No release
bump is scheduled.

CPU validation retained the full sequence after an abrupt baseline timing drop:

| Run                  | Warmup updates | Alternating pairs | Baseline thread CPU | Candidate thread CPU |  Change |
| -------------------- | -------------: | ----------------: | ------------------: | -------------------: | ------: |
| Initial              |            600 |                 3 |           985.82 ms |          1,223.25 ms | +24.08% |
| Same-code control    |            600 |                 3 |         1,107.37 ms |          1,024.70 ms |  −7.47% |
| Longer steady repeat |          1,200 |                 6 |         1,353.98 ms |          1,383.61 ms |  +2.19% |

The same-code row compares the baseline with itself. Four of six steady pairs
favor the candidate; their median relative change is −2.29%, but one abrupt
baseline drop reverses the mean. These results establish neither a general CPU
speedup nor a consistent regression. Retain all samples rather than selecting
only favorable pairs. A separate instrumented counter diagnostic confirms equal
work: both versions encode 1,199 passes and 38,368 draws per 600-update sample.
Style propagation can queue a render alongside the immediate viewport render;
both versions execute the same count. Counter timings are diagnostic only.

Keep the scalar change for its repeatable allocation reduction and deletion of
known redundant per-draw work, with CPU benefit explicitly unproven. Broader
scope normalization/layerization remains the larger allocation source. No
whole-frame pool, offset/options reuse or profiler callback dispatcher is added;
those require separate evidence and ownership design. Commit:
`perf(webgpu): avoid temporary rectangles during draw encoding`.

## Frame preparation with the existing API

Baseline: `fd57f4f9d`. The user authorized the next frame-preparation
opportunity, requires this plan update before implementation, and requires CPU
verification with real wheel zoom and drag pan. Keep the renderer API, accepted
mutable inputs, validation, picking and detached-export behavior intact.

### Ownership and proposed simplification

Core owns its frame-plan commands and per-paint semantic items. The renderer
validates those inputs into its own normalized draw/group data. Only the flat
normalized draws survive for later picking; normalization/layerization working
arrays belong to the current synchronous render call. Public caller arrays and
objects must never become scratch storage.

Start with renderer-local reuse rather than a new retained-frame API or a pool:

- Build the existing normalized group representation during normalization,
  deriving its sample count from child coverage and resolving inherited labels.
  Remove the separate intermediate semantic-scope representation where its
  metadata is already equivalent to a normalized group.
- Layerization may update the renderer-owned group bounds and child arrays in
  place. It must retain the existing flattening, opacity isolation, coverage-run
  ordering, clipping, labels and group-count decisions.
- Evaluate returning already-owned draw-only leaves directly, but retain the
  general traversal unless native-input CPU measurements justify the added
  pre-scan and branch. This shortcut is discarded after the initial comparisons
  show no reliable CPU benefit and the user explicitly prefers KISS.
- Inspect Core scope-array lifetimes before considering any Core reuse. Reuse
  there is optional and belongs in this change only if it is demonstrably safe,
  smaller and independently useful; do not rewrite private snapshot contracts
  merely to reduce a file count. Renderer-local improvements are sufficient if
  Core reuse would require another ownership protocol.

No cross-frame object pool, identity cache, revision handle, generic dispatcher
or new subscription is authorized. Retained draw/viewport/scissor data, dynamic
bind offsets and custom program draw options preserve their current ownership.
Do not add profiler-callback or effective-scale-range work to this milestone.

### Verification and acceptance

Use existing renderer/Core tests for nested groups, mixed single/multisample
coverage, conditional ordering, zero/one/fractional opacity transitions, mutable
caller input detachment, later picking and detached targets. Extend only the
cases that protect a distinct ownership or composition boundary. Native output,
picking and export must remain equivalent to the baseline at controlled states.

Reuse the existing browser measurement infrastructure for fixed native input
traces: actual wheel events and mouse down/move/up pan events over an
interactive plot. Do not call `zoomTo(..., {renderImmediately:true})` or mutate
style parameters inside CPU measurement windows. Assert that the interaction
really changes the relevant domain/viewport, and that both versions receive the
same input trace. Record interaction settling, source hashes, browser/GPU
details, errors and render/frame counts when available. Keep counter diagnostics
separate if instrumentation is needed to establish equal work.

CPU acceptance uses hardware-backed Chrome/Metal, explicit CDP threadTicks
metrics, alternating baseline/candidate order, warmed interaction state and a
same-code control. Measure representative scope-heavy views and a committed real
example. Do not run CPU/allocation samplers, traces, tests or parallel browser
benchmarks during acceptance. Run allocation sampling separately using the same
inputs. Record all samples, including unfavorable ones. Retain only a coherent
change with useful work/allocation reduction and no reproducible CPU regression.
Claim a CPU speedup only when direction and magnitude exceed control variation;
otherwise report CPU as unchanged or inconclusive.

The user's measurement refinement replaces the small example as the main load
with grids of 20 and 40 complete copies of the committed clustered heatmap,
including dendrograms, matrix, axes and legends. Preserve independent cameras:
native gestures move one matrix while frame preparation visits all copies. Size
the canvas to render every copy and record actual view counts. Keep the
generated specifications and measurement drivers as local diagnostic artifacts.

Headed input diagnostics caught physical desktop mouse movements during an
automated held-button drag. Use headless Chrome with the same native Metal
adapter for the isolated CPU comparisons, as in the existing native GPU suite.
Dispatch trusted wheel/mouse events through CDP Input without Playwright's drag
interception scripts. Verify event cadence separately, include 1,600 ms for pan
inertia, and reject camera movement during a further 400 ms outside the timing
window or while another page receives input. These results cover renderer-main-
thread CPU per interaction trace, not headed compositor cost or UI latency.

- [x] Confirm internal ownership and the smallest coherent implementation.
- [x] Simplify normalized scope/group handling and reuse owned groups.
- [x] Verify representative tests, types, native rendering/picking/export and
      independent implementation review.
- [x] Compare baseline/candidate CPU using real wheel and pan, and allocation in
      separate diagnostic runs; address any correctness or performance finding.
- [x] Record source size, release impact and all measurement limits, then commit
      the accepted change as `refactor(webgpu): reuse normalized render groups`.

This is unpublished renderer/internal Core work. Reuse the existing empty
changeset; no public renderer migration or package version bump is intended.

Implementation stays entirely in renderer normalization/layerization. Core scope
reuse is deferred: prior Core scope results preserve their numeric opacity
values, so reusing them would change a private result lifetime contract. The
renderer-local change needs no such ownership change. After discarding the
unproven draw-only shortcut, its source shrinks from 2,021 to 2,006 raw lines,
including deletion of the duplicate intermediate scope types.

The implementation fixes each group's sample count from its normalized children
before clipping or flattening, preserving the old mixed-scope classification.
Nearest-parent labels are resolved during normalization. Only newly owned group
bounds/items are replaced during layerization without mutating draw records.
Both group constructors use the same property order. The independent final
source/test review found no correctness issue; the single general traversal
preserves the original coverage flush and group-count decisions.

Current correctness checks pass 489 focused tests across 53 files, renderer
TypeScript, scoped lint/format and 14 native GPU tests. Coverage includes frozen
nested caller inputs, fractional-to-opaque rerenders, preservation of initial
sampling classification when a child clips away, and live/explicit picking
frames across detached export. No Core source or public declaration changed.

### Native-input results and final KISS decision

Measured on 2026-11-05 with Chrome 156.0.8078.80, Apple M5, native Apple Metal-3
WebGPU, DPR 1. Each grid contains the complete example, including its two
dendrograms, matrix, axes and local legend. The 20/40-copy scenes visit
621/1,241 views and encode 300/600 draws per ordinary render, respectively. All
matrices fit the canvas; initial baseline/candidate raster exports match byte
for byte at both sizes. Generated manual-test specs are kept locally as
`output/webgpu-direct-uniforms/heatmaps20-spec.json` and
`output/webgpu-direct-uniforms/heatmaps40-spec.json`.

The temporary driver is `/private/tmp/webgpu-native-input-measure.mjs`. Final
CPU invocations use `--scene=heatmaps --heatmaps=20` or `40`, `--headless`,
`--pairs=3 --warmup=2 --wheel-events=24 --drag-steps=48 --drags=2 --event-ms=1 --settle-ms=1600`;
40-copy runs also use `--reverse-init`. Controls add `--baseline-control`,
serving the baseline source to both pages. Measured order alternates
baseline/candidate and candidate/baseline. A separate input diagnostic verifies
exactly two down/up pairs and 96 trusted drag moves per page, median move
spacing about 16.7 ms. Page-activation, cross-page camera guards and the
post-window stability check pass. Vite development transport and console
forwarding are disabled in the temporary harness for both versions. No render
observers, Core profiler, samplers or tracing run in CPU acceptance.

All CPU samples below are main-thread milliseconds per fixed input trace;
controls compare two pages running identical baseline code. Negative change
favors the candidate/page B. Keep the unfavorable samples too.

| Run                                             | Baseline/page A samples   | Candidate/page B samples  | Change of means |
| ----------------------------------------------- | ------------------------- | ------------------------- | --------------- |
| 20-copy control                                 | 474.329, 480.536, 469.890 | 458.846, 459.308, 493.072 | -0.95%          |
| 20-copy initial shortcut                        | 467.349, 470.406, 468.234 | 488.869, 501.579, 488.078 | +5.16%          |
| 20-copy aligned group fields, shortcut retained | 444.477, 486.346, 504.791 | 485.470, 481.107, 483.333 | +1.00%          |
| 20-copy final single traversal                  | 480.005, 492.908, 489.628 | 452.068, 476.986, 489.501 | -3.01%          |
| 40-copy control                                 | 642.147, 652.722, 662.753 | 688.547, 699.020, 684.527 | +5.85%          |
| 40-copy final single traversal                  | 664.800, 672.873, 641.998 | 674.739, 753.413, 678.881 | +6.43%          |

Neither a general CPU speedup nor a reproducible regression beyond the control
and interaction variation is established. Individual control pairs span -4.42%
to +4.93% at 20 copies and +3.29% to +7.23% at 40 copies. The final candidate's
pairs span -5.82% to -0.03% and +1.50% to +11.97%, respectively. Matching group
property order removes an unnecessary representation difference, but these
timings do not establish that it caused the earlier result. The draw-only
pre-scan/shortcut has no demonstrated CPU benefit and is removed at the user's
KISS direction. Keep only the smaller shared group representation and reuse of
its owned fields; retain the original single layerization walk.

Separate frame diagnostics confirm 274 ordinary renders and five picking passes
for both versions at both sizes. Ordinary draw totals match at 82,200/164,400,
group totals at 10,960/21,920, and view visits at 170,154/340,034. These are
coordinator passes, not presented display frames, and are not used to normalize
CPU from another run. Reactive work is not identical: retained resource writes
are 5,247 vs 3,544 at 20 copies and 3,624 vs 3,644 at 40. Native camera spans
agree to floating-point precision, while maximum paired endpoint differences are
0.034%/0.114% of the span. Small inertial trajectory and reactive-update
differences limit attribution even when rendered work counts match. All final
samples have no loading/rendering errors and pass camera-stability and
cross-page guards.

Allocation runs use the same native inputs with
`--mode=allocation --pairs=2 --warmup=1`, separately from CPU acceptance. Values
below are means of two statistically sampled allocation estimates, including
collected objects, in decimal MB. The preparation subtree is the union rooted at
renderer `#normalizeRenderItems`, without double-counting recursive nodes.

| Copies | Total baseline -> candidate | Preparation baseline -> candidate |
| ------ | --------------------------- | --------------------------------- |
| 20     | 154.036 -> 152.687 (-0.88%) | 61.491 -> 61.405 (-0.14%)         |
| 40     | 290.048 -> 288.250 (-0.62%) | 119.271 -> 118.934 (-0.28%)       |

These differences are small; do not claim a substantial allocation improvement
or CPU gain. Raw total samples are 154.890/153.182 vs 153.858/151.517 MB at 20
copies and 290.301/289.795 vs 289.149/287.351 MB at 40. Sampled main-thread GC
intervals also vary: baseline/candidate union durations are 21.600/18.802 and
28.496/19.037 ms at 20 copies, 24.408/25.035 and 38.650/24.437 ms at 40.
Instrumented timings are diagnostic only and do not establish a GC benefit.

All artifacts remain under `output/webgpu-direct-uniforms/` with prefixes
`native-frameprep-{20,40}-{control,kiss-cpu,allocation,frames}`. Earlier
shortcut experiments use `native-frameprep-20-cpu` and
`native-frameprep-20-shaped-cpu`. Metadata records source/driver/scene hashes,
hardware, input counts and camera snapshots; profiles and GC traces are kept.
The aggregate is `native-frameprep-comparison-summary.json`, produced by the
temporary `/private/tmp/summarize-native-frameprep.py`. Earlier headed and
short-tail smoke/control runs are retained as diagnostics, excluded from
acceptance because of truncated inertia, physical desktop input or development
WebSocket errors. Headless results do not establish headed compositor cost,
physical display cadence or user-input latency.

The final version passes 489 focused tests across 53 files, 14 native Metal GPU
tests, renderer TypeScript and scoped ESLint. Release policy/status checks pass
with no package bump. Source decreases by 15 raw lines; no public declaration or
Core production file changes. The temporary verification server is stopped.

## CPU attribution against WebGL

Baseline: `e58dde16c`. The user authorized profiling the 40-heatmap native
wheel/pan workload in both backends, followed by one small, evidence-backed
optimization and unsampled verification. Keep the current renderer API and
choose KISS if the measured difference does not justify extra machinery.

Reuse the local 40-copy spec and native-input driver. First collect separate
Chrome CPU sampling profiles with Core instrumentation disabled for both WebGL
and WebGPU. Verify hardware rendering, complete view/mark composition, camera
movement/settling and page isolation. Backend font metrics and antialiasing can
differ, so compare layout/camera work and visible content rather than requiring
cross-backend PNG equality. Sampling is attribution evidence only; retain
profiler-disabled main-thread CPU timing for acceptance.

Select the largest demonstrated WebGPU-specific cost, checking its real owner
and caller contract before changing code. The disabled-profiler view callbacks
are a lead, not proof of allocation or CPU cost: V8 may eliminate them. Do not
add pooling, retained-frame ownership protocols, range-publication machinery or
an instrumentation dispatcher without evidence. Any API inadequacy remains a
proposal requiring permission. A local simplification can affect shared
instrumentation only if its measured benefit and profiler behavior are verified.

- [x] Attribute current CPU work with 40-heatmap WebGL/WebGPU sampling profiles.
- [x] Implement one justified simplification, or record that no code change is
      warranted; independently review any production change.
- [x] Verify affected contracts and compare unsampled native wheel/pan CPU,
      using same-code controls and separate work-count checks as needed.
- [x] Record all results, source size and release impact; commit the coherent
      milestone and stop the temporary verification server.

Initial attribution rejects the profiler-wrapper hypothesis: the four profiles
have no self samples in `measurePerformance`, and its inclusive samples are the
actual callback work. The strongest repeated JavaScript lead is
`#prepareMarkState` and its packed-data/rectangle checks. In particular, 24 of
25 sampled `zoomExtent` getter calls come directly from `getPackedMarkData`.

The first candidate limited extent tracking to the factory's existing point/
rect whitelist. It measured less CPU, but the user correctly challenged whether
that whitelist represents a real constraint. History shows limited initial
implementation scope, not a renderer requirement. Rules, arrows and links have
logical row ranges; text already translates logical strings to glyph ranges.
Discard the type-based packing guard and its unsupported-text regression.

Correct shared eligibility and then use it to avoid irrelevant cache lookups:

- Extract the existing cheap encoder prerequisites into one shared
  `getMarkXIndexScaleResolution` helper, consumed by the spec factory and both
  WebGPU/Canvas cache owners. Check actual index configuration, numeric scale
  and branch compatibility before resolving scale/extent. Do not add a cache,
  revision protocol, listener or capability registry. Finite-extent validation
  remains in spec construction so invalid-to-valid extent transitions work.
- Remove the blanket point/rect restriction. Endpoint intervals cover rules,
  ticks, text and arrows under the existing one-viewport geometry margin.
  Rectangles/rules/ticks that clamp by clipping or hiding collapsed intervals
  remain indexable. X-clamped point/text/arrow/link anchors need a full-range
  fallback because offscreen raw coordinates can become visible at the edge.
- Links need geometry-based eligibility: known literal line, orthogonal,
  diagonal and dome shapes stay inside their endpoint x envelope; generic arcs
  can bow outside it. Arc and expression-driven shapes retain the conservative
  fallback until a suitable envelope is available. Both cache owners reevaluate
  eligibility: safe/unsafe shape or clamp changes toggle the existing cached
  resolution between its object and undefined, so no new revision is needed.
- Canvas text/link/arrow visitors currently ignore nonempty start/end candidate
  ranges. Honor the same optional absolute row bounds already used by the
  point/rect/rule visitors. SVG callers without bounds retain complete
  traversal; Canvas rendering and picking must consume the same indexed rows.

Verify shared eligibility, clamping/curve fallbacks, domain transitions,
placement/facet ranges, text logical-to-glyph mapping and actual Canvas row
visitation. Retain the renderer API. Shared Canvas indexing changes have
published Core release impact and require a patch changeset. Repeat unsampled
native-input CPU verification for the final generic implementation; the first
whitelist-based candidate is diagnostic evidence only.

### Attribution, correction and measured outcome

The native hardware is unchanged: Chrome 156.0.8078.80 on Apple M5. The active
WebGL canvas reports `ANGLE Metal Renderer: Apple M5`; WebGPU reports Apple
Metal-3. Both backends render all 40 matrices and 120 public unit views. The
first matrix has the same 180 by 110 plot bounds at (60, 60), and paired camera
endpoint differences stay within 0.047% of the span. Backend font metrics and
antialiasing differ, so cross-backend PNGs are inspected as equivalent content,
not required to have identical hashes.

The temporary `/private/tmp/webgpu-backend-cpu-measure.mjs` reuses the native
input driver. Attribution uses
`--comparison=backends --mode=profile --pairs=2 --warmup=2 --scene=heatmaps --heatmaps=40 --headless --wheel-events=24 --drag-steps=48 --drags=2 --event-ms=1 --settle-ms=1600`.
CDP sampling requests 1,000 microseconds; weighted sample intervals are about
1.25 ms. Sampled stack time includes wall time in native calls and must not be
interpreted as measured thread CPU. `#prepareMarkState` has about 58/65 ms self
samples, packed-data lookup 21/24 ms, and the zoom-extent getter 23.5/7.6 ms.
The absence of wrapper self samples is not proof of zero cost, but provides no
basis for the proposed profiler rewrite; leave that instrumentation unchanged.

Unsampled backend comparison uses `--mode=cpu --pairs=3` with the same inputs:

| Backend         | Main-thread CPU samples (ms) | Mean (ms) |
| --------------- | ---------------------------- | --------- |
| WebGL           | 1044.662, 1022.588, 1000.355 | 1022.535  |
| WebGPU baseline | 660.371, 655.351, 685.012    | 666.911   |

WebGPU uses 34.78% less main-thread CPU in this specific scene before the new
change. This is not a claim about every scene, headed presentation latency,
total browser-process CPU or GPU cost.

The preliminary point/rect guard measured -9.26% CPU (674.487 -> 612.024 ms),
with a -0.81% same-code control. Its samples remain in
`native-index40-{cpu,control}`. Discard the implementation despite that result:
duplicating an incomplete mark whitelist would preserve a capability bug.

The final implementation shares actual eligibility across the spec factory and
both cache owners, and completes candidate-range consumption in Canvas text,
link and arrow visitors. The existing cache keys handle eligibility changes; no
listener, retained-frame protocol or new cache state is added. Core's
renderer-neutral index subsystem owns these rules. No renderer package API or
view/parameter ownership contract changes.

Final CPU comparisons use
`--comparison=changes --backend=webgpu --base=e58dde16c --mode=cpu --pairs=4 --warmup=2`
and the same native input arguments above. Controls add `--baseline-control`.
Keep every sample:

| Run                          | Baseline/page A samples (ms)       | Candidate/page B samples (ms)      | Change of means |
| ---------------------------- | ---------------------------------- | ---------------------------------- | --------------- |
| Final generic implementation | 617.871, 659.658, 645.639, 626.782 | 613.943, 614.689, 592.531, 580.884 | -5.80%          |
| Matching same-code control   | 644.379, 637.699, 628.626, 647.567 | 633.198, 661.629, 645.508, 649.642 | +1.24%          |

The final mean is 637.488 -> 600.512 ms. All four candidate pairs favor the
change (-0.64%, -6.82%, -8.23%, -7.32%); control pairs range from -1.74% to
+3.75%. Retain the small generic change for its corrected dependency boundary,
broader mark support and measured benefit in this workload. Do not generalize
the effect size. Maximum paired camera endpoint variation is 0.034% of the span
in the candidate run and 0.101% in the control. Camera isolation/settling,
source hashes and loading/rendering error checks pass.

A separate frame diagnostic matches 274 visible renders, five picking passes,
164,400 ordinary draws, 21,920 groups and 346,239 view visits in both versions.
Retained resource writes vary (3,635 vs 5,273), so rendered count equality does
not establish identical reactive update work. Counter timings are not CPU
acceptance and are not used to normalize another run.

The temporary `/private/tmp/webgpu-xindex-output-check.mjs` verifies the actual
Core-to-WebGPU path with 200 sorted rows and numeric rule/text/arrow/line-link
tracks. This deterministic correctness check sets the public viewport to [80,
90]; it is not an interaction timing sample. Enabling indexing reduces 800
source rows to 163 candidates across four queries. Indexed and full-range
exports are byte-identical, including variable-length text strings, and public
scoped picking returns row 85 at the same coordinates for all four mark types.
The native adapter and loading/rendering checks pass.

Artifacts are under `output/webgpu-direct-uniforms/`:

- `native-backends40-profile-{webgl,webgpu}-{0,1}.cpuprofile` and the
  corresponding metadata/results; offline attribution is in
  `/private/tmp/native-backends40-profile-analysis.json`.
- `native-backends40-cpu` for the unsampled backend comparison.
- `native-index40-generic-cpu-v2`, `native-index40-generic-control` and
  `native-index40-generic-frames` for final candidate verification.
- `native-core-xindex-output-report.json` with specifications, PNGs and picking
  identities for the deterministic check.

The first generic timing attempt stopped before collecting any samples because
the source-substitution harness did not resolve a newly intercepted bare
dependency. The corrected harness uses Vite's optimized dependency manifest and
canonical versioned URLs, preserving module identity for both versions. Its
failure artifact is retained and excluded from timing evidence.

Final verification passes 703 Core rendering tests across 80 files, Core
TypeScript, scoped ESLint/format and independent cross-consumer review. Existing
renderer logical-string-to-glyph range handling is retained. The six changed
production JavaScript files grow from 1,698 to 1,739 raw lines (+41), including
shared eligibility documentation and visitor range types. This growth fixes
missing mark support and is justified by the native output/picking and CPU
results; the wider branch remains smaller in runtime code. The existing
changeset now requests a Core patch, propagated to the eight-package fixed
release group; release policy/status checks pass. The temporary server is
stopped. Deliver as `fix(core): index eligible mark geometry across renderers`.
