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
waive this constraint.

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
- [x] Compile fixed-shape viewport comparison/copy operations into the existing
      binding. Reuse its owned detached snapshot instead of generic object
      traversal and allocation. Other mutable bindings retain their existing
      semantics. Initialize with an owned copy even for frozen input tuples.
- [x] Capture gap state and its uniform writer once; choose plain/band/gapped
      domain publication once and use the already captured continuous-domain
      writer. Keep renderer boundary validation and viewport detachment intact.
- [x] Remove the extra global/composite/table/palette payload scans from
      `26da369de`; retain straightforward packing/upload paths.

Affected files: Core `webGpuSurface.js` and renderer `scaleResources.js`, plus
the reverted upload-guard files. Existing tests cover config replacement,
mutable and frozen inputs, null/rank transitions, live/picking/export behavior,
exact gaps, growth and disposal. No new routing framework or renderer API is
needed.

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

| Input class                             | Current disposition                                                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Expression-backed styles/properties     | Reuse subscribed evaluators; no per-read parse/codegen/binding                                                         |
| Numeric/color channel values            | Existing compiled encoders and retained setters; no added payload guards                                               |
| Scale domains/ranges/viewports/gaps     | Existing change filtering plus native mapping snapshots, specialized viewport tracking and captured renderer writers   |
| Selection uniforms/hash tables          | Existing Core change filtering and renderer capacity reuse; no new cache/sharing contract                              |
| Palettes/ordinal/domain/cut tables      | Normalize on dispatched updates; Core already filters unchanged leaves; callable palettes and mutable ranges stay live |
| Occurrence globals/composite opacity    | Straightforward packing/upload restored; no extra CPU scan to save transfers                                           |
| Placement/text lookup buffers           | Existing topology/geometry/series revision updates and capacity reuse                                                  |
| Font/path atlases and generation inputs | Existing shared/append-only atlas and retained scratch resources; no redraw-time generation added                      |
| Dash textures                           | Initialization-only build/upload; per-mark sharing deferred without a creation-heavy CPU workload                      |

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

Across the six affected runtime files, source grows from 7,651 to 7,744 raw
lines against the original foundation (+93), and from 7,735 to 7,744 against the
misdirected upload commit (+9). The growth is justified by measured CPU removal,
explicit snapshot ownership and one retained evaluator source of truth, rather
than new tracking layers. Guard-specific upload tests were removed; existing
behavior tests were extended and one real headless multi-mark expression test
protects zero recompilation during retained reads.

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
