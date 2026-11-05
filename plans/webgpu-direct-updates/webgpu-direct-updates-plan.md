# WebGPU CPU cost of retained updates

Status: CPU-focused implementation, independent review, native measurements and
applicable verification are complete. Retain this temporary plan with the draft
PR and retire it before merge.

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
opportunities. The user authorized implementation of **1 and 2**; record the
others as deferred rather than expanding this change. Most of the 2,645-line
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
3. **Classify remaining literal properties (deferred).** Point `inwardStroke`,
   rule cap/alignment and property-backed glyph offsets remain live when
   literal. Existing static/live property helpers could avoid these bindings,
   mainly during style updates; scale-only updates already skip them. No new
   cache or subscription registry is justified.
4. **Remove small renderer allocations (deferred).** Reuse scale-owned scratch
   for the four-number gap-geometry write and pass packed interval-selection
   typed output directly instead of copying through `Array.from`. Preserve
   complete selection validation before writes, public input detachment and
   scale/config ownership boundaries.
5. **Profile draw preparation for larger gains (deferred).** Previous allocation
   samples attribute roughly 20 MB of 66 MB to normalization and related
   helpers. Draw clipping creates three temporary rectangles per encoded draw;
   scalar clipping/physical conversion is a bounded candidate before whole-frame
   reuse. Preserve target origins, fractional-DPR rounding and retained
   picking-frame lifetimes. Disabled-profiler callbacks are another diagnostic
   lead, not a proven source of all allocations attributed to their caller.

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
retire it before merge. Opportunities 3–5 require a later implementation
decision.

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
