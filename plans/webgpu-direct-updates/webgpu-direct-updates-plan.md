# WebGPU retained update optimization

Status: the existing foundation is implemented, reviewed and measured during the
SampleView investigation. The continuation below broadens the investigation to
all GPU input data carried by uniforms, textures and equivalent lookup buffers.
The SampleView placement/navigation refactor stacks on this foundation. Retain
this temporary record for draft discussion and retire it before merge.

## Goal and architecture

Reduce repeated adapter evaluation and uniform packing without changing the
renderer API, GPU resource ownership, batching or picking semantics. Correct
live categorical ranges and preserve pixel geometry under ordinary placement.
These changes also apply to ordinary Core marks without SampleView.

Start at [ARCHITECTURE.md](../../ARCHITECTURE.md) and Core's
[rendering architecture](../../packages/core/docs/architecture/rendering.md).
Core owns specification semantics, completed scale mappings and rendering
revisions. Its WebGPU adapter translates those into documented renderer slots.
The renderer owns validation, fixed uniform layouts, packing, shaders, resources
and disposal. No renderer implementation import crosses the adapter boundary.

Scale-only revisions use the existing retained binding set without reevaluating
unrelated mark properties and expressions. Resource-expression revisions still
refresh those inputs. Numeric/color literals use static slots. Frozen
categorical domains retain identity, while mutable domains are copied so
in-place edits are observable. Band bindings read the current effective range
and edges, including reversed ranges.

The renderer compiles uniform writers from fixed layout entries and retains
direct writers in scale, value and scalar slots. Each writer selects its
Float32Array, Int32Array or Uint32Array view once. Named writes use the same
implementation. Layout offsets, types and strides remain the source of truth;
there is no second packing model. Existing typed series storage uses the same
native-endian representation assumption. WebGL/TWGL's retained setters provide
the precedent for resolving static destinations once; no external code is
copied.

Placement fits mark coordinates while retaining pixel-sized strokes, point
sprites and offsets. The renderer's generic GPU regression verifies this with
placed geometry, diagonal rules and collapsed marks. Legacy metadata facet
support remains here; its removal belongs to the SampleView consumer PR.

## Completed milestones

| Outcome                                                                      | Consumers and verification                                                                                  | Commit                                                             |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Skip unrelated bindings on scale-only updates                                | Shared Mark revisions and Core WebGPU surface; expression, configuration and resource lifecycle regressions | `perf(core): skip unrelated WebGPU bindings during scale updates`  |
| Retain immutable inputs and literal channels; follow live categorical ranges | Core adapter/surface; composed band navigation, reversed ranges, literals and mutable-domain tests          | `perf(core): retain immutable WebGPU inputs and literal channels`  |
| Preserve pixel geometry through placement                                    | Renderer mark programs; generic GPU placement/clamping regression                                           | `fix(webgpu-renderer): preserve pixel geometry through placements` |
| Compile retained typed uniform writers                                       | Named/retained f32/i32/u32, vectors, strided arrays, omitted uniforms and invalid shapes                    | `perf(webgpu-renderer): compile retained typed uniform writers`    |

Public renderer declarations and other rendering backends are unchanged. No
grammar, persistence or user-documentation migration is required. Core's small
revision extension preserves its existing consumers. The WebGPU implementation
is unpublished and excluded from released Core bundles, so this foundation adds
no changeset. At the original PR base, existing fragments queued the fixed-group
1.3.0 release; the continuation below records the newer base and delivery check.

## Measurements and rejected alternatives

Measurements were collected in the SampleView investigation. They isolate
individual optimization candidates on that application; they do not establish a
whole-application gain for this complete foundation against remote master.

The earlier scale-only binding subset reduced an instrumented scroll probe from
31,680 to 18,900 binding reads (40.3%) with 2,400 writes in both versions. The
instrumented resource phase changed from 1.427 to 1.292 ms/frame (9.4%). With
application profiling disabled, renderer-thread CPU was 845.29 versus 844.29 ms
per interaction, within variation.

A larger grouped-mapping/input-mask and reusable viewport-storage experiment
reduced binding reads from 57,420 to 22,080, but logical writes stayed 7,440 and
GPU writeBuffer calls/bytes stayed 3,900/5,716,352. It added 113 production
lines without a reliable application benefit and was discarded. Preserve its
history on `codex/webgpu-direct-updates-experiment`; do not revive its parallel
routing model without new evidence.

For the final writer selection, five alternating warmed Chrome 156 packing
rounds performed one million domain/gap updates and two million writes each.
Final bytes matched. Median packing time was 22.2 ms for the original named
DataView implementation, 45.0 ms for compiled bound DataView writers
(discarded), and 9.4 ms for retained typed-array writers: about 58% less packing
time. This excludes uploads, drawing, layout and adapter work.

Three alternating warmed, profiler-disabled WebGPU synthetic interaction pairs
measured 833.907 versus 816.907 ms mean renderer-thread CPU for original versus
typed writers. Pair differences were -4.55%, +3.53% and -4.82%; no reliable
whole-interaction speedup is claimed. P95 cadence was comparable. The selected
writer-only change added two net non-comment production lines and no Core code.
It does not establish that native band navigation's earlier application CPU
overhead has been eliminated.

## Historical integration verification (before the master rebase)

- [x] Independent foundation diff review: no App, SampleView navigation policy,
      metadata facet removal, heatmap example or discarded experiment leaks.
- [x] Standalone foundation: 192 focused Core tests and 319 renderer tests pass.
- [x] Core and renderer TypeScript checks pass.
- [x] GPU placement/clamping regression passes in Chrome.
- [x] Release policy and release-status checks pass.
- [x] Scoped lint and format checks pass.
- [x] All non-plan tracked files on the reconstructed upper branch match the
      previously tested `a13287481` tree exactly; independent review has no
      findings.

Earlier integration checks on the complete consumer stack covered native band
heatmap navigation/restore, shared matrix/tree resolutions, point size,
category-selection updates, quantitative zoom and semantic thresholds with no
runtime errors. A future stack rebuild must preserve the consumer's feature
delta while incorporating the new base; the earlier exact-tree comparison was
specific to the history-only split.

## Further optimizations to investigate

The continuation below expands the earlier scale-focused opportunities to every
uniform and texture input, including storage-buffer equivalents of WebGL data
textures. Investigations are not implemented or benchmarked promises. The
current renderer API must remain unchanged unless the user approves a concrete
API proposal first.

## Continuation plan — 2026-11-04

Aim: make supplying shader data through WebGPU uniform buffers, textures and
equivalent lookup buffers as efficient as WebGL's retained data path, while
preserving the current renderer API and rendering correctness.

### Starting point and scope

PR [#659](https://github.com/genome-spy/genome-spy/pull/659) is an open draft at
`b327a75e8`, on `codex/webgpu-retained-updates`. GitHub Node.js CI and
Changesets both pass at that head; there are no submitted GitHub reviews or
inline review threads. The implementation and earlier independent reviews above
are complete. These facts were checked on 2026-11-04; they are not new local
test results.

The managed worktree is checked out on that branch, locally rebased onto fetched
`origin/master` at `d8547c2a9`; its new head is `a0493a255`. All six commits
remain patch-equivalent according to `git range-diff`. The original head is
preserved on `codex/webgpu-retained-updates-before-rebase-20261104`. Uncommitted
plan changes were restored after rebasing. No push or dependent-branch rewrite
was performed. Worktree dependencies were installed with
`HUSKY=0 npm ci --offline`.

Post-rebase verification at `a0493a255`: 130 focused Core tests and 15 renderer
tests pass, along with both package TypeScript checks and plan formatting/
whitespace checks. GPU/browser tests and GitHub CI have not been rerun for this
local head; their earlier results above remain historical.

The new base is nine commits beyond this PR's original base `a126a1449`. Its
rule-stroke alignment change in `webGpuMarkAdapter.js` is retained alongside
this branch's adapter changes. The release has advanced to 1.3.0, so the
historical queued-release statements above must be reassessed at delivery rather
than copied forward.

Scope includes all uniform/texture input data, not just scales or zoom-dependent
values. Audit the complete data path and select measured improvements in
coherent milestones; keep already efficient paths. The existing foundation can
be delivered independently of later optimizations. SampleView policy and legacy
metadata-facet removal stay in stacked draft
[#660](https://github.com/genome-spy/genome-spy/pull/660).

The current `webgpu-renderer` API is a hard constraint: preserve exports,
declarations, handle/slot methods, accepted inputs and observable
update/lifetime semantics. Internal evaluation, packing, caching and uploads may
be improved within that contract. If the API obstructs an optimization, document
the exact limitation and propose a concrete API change with measured motivation,
alternatives and compatibility/migration costs. Obtain the user's explicit
permission before implementing that API change; continue independent internal
improvements in the meantime. The package's unpublished status does not waive
this constraint.

Preserve the existing slot timing contract too: individual mutations take effect
immediately, and `batchUpdates` consolidates related uploads, rebindings and
picking invalidation. See `packages/webgpu-renderer/README.md`, "Batched
updates". Do not turn immediate updates into deferred work as an internal
optimization.

### 1. Reconcile the foundation with current master

- [x] Fetch current master, preserve the original foundation head for
      comparison, install dependencies in this worktree, and rebase the
      foundation onto `origin/master`.
- [x] Preserve master's live rule `strokeAlign` binding alongside this PR's
      static-literal handling, effective categorical ranges and resource
      revision filtering. Do not interpret matching initial values as shared
      scale identity.
- [x] Inspect the resulting diff for unrelated App policy or rejected experiment
      code. Retain the existing documented Core/renderer ownership boundary and
      the current renderer API.
- [ ] Coordinate the dependent #660 rebase onto the new foundation before
      updating its branch. Replay only its upper commits; preserve the
      SampleView delta and account for changes already landed on master, such as
      the heatmap example.

Outcome: a current standalone foundation and an explicit update path for its
consumer. Verification includes the focused Core adapter/surface tests and the
newly inherited rule-alignment behavior. No user-doc migration is expected.
Rebasing itself needs no new implementation commit; any meaningful conflict fix
should be folded into its owning commit.

### 2. Verify the retained-update contracts across integration

- [x] Run focused Vitest coverage in `mark.test.js`, `webGpuMarkAdapter.test.js`
      and `webGpuSurface.test.js`, plus renderer `uniformBuffer.test.js` and
      `scaleResources.test.js`, using the `agent` reporter: 145 tests pass after
      rebasing. Rerun affected suites after relevant implementation changes;
      extend coverage only for a distinct regression and remove overlapping
      implementation-detail assertions when code changes make them redundant.
- [x] Run Core and renderer TypeScript checks after rebasing.
- [ ] Preserve simultaneous scale/style transactions, selection changes,
      configuration replacement, mutable-domain updates, frozen-domain reuse,
      reversed bands/gaps and independently scaled secondary channels.
- [ ] For input-data paths changed in milestone 3, extend the existing resource,
      renderer and GPU suites with representative unchanged-frame and targeted
      mutation cases. Verify visible/picking/export transitions, resize/DPR,
      texture or buffer growth/rebinding, shared-resource disposal and
      empty-data behavior where those contracts are affected. Do not add a
      configuration matrix for paths whose implementation remains unchanged.
- [ ] Run the real-GPU `tests/mark-clamping.gpu.test.js` regression. Smoke-test
      ordinary band navigation, semantic zoom and picking through public Core;
      verify inherited rule-stroke alignment on WebGL and WebGPU. Use the
      existing clustered-heatmap and semantic-zoom examples, not a new
      validation harness.
- [ ] If the dependent stack is rebuilt, verify SampleView peek/scroll,
      sort/filter/undo, row alignment and plot picking on #660. Keep the known
      WebGPU grouped-summary limitation separate from supported-case acceptance.
- [ ] After relevant implementation changes, run affected package type checks,
      scoped lint/format and applicable release checks. Let updated CI cover
      broader integration; expand local tests only for a concrete unresolved
      risk.

Outcome: current evidence that fewer evaluations and cheaper packing retain
observable behavior. Core's `mark.js` owns revisions; `webGpuSurface.js` owns
binding refresh and snapshots; renderer `uniformBuffer.js` owns packing and
`baseProgram.js` owns flushing. The existing foundation still uploads whole mark
blocks; milestone 3 may change internal upload spans if measurements justify it.
No public API, persistence or documentation migration is planned. A discovered
regression would get a focused message such as
`fix(core): preserve live WebGPU inputs after scale updates`.

### 3. Audit and optimize every GPU input-data path

Use WebGL's captured setters, dirty mark blocks and shared lookup ownership as
the reference. Match the efficiency principles using WebGPU's own resource
model; copying WebGL layouts or requiring identical API calls is not the goal.
Inventory every class below, record its update trigger, owner, sharing identity,
payload preparation, upload/copy cost and disposal. Unchanged data should retain
resources and avoid redundant work wherever frame/target semantics permit it.

| Data class                                                                            | Current WebGPU owner and representation                                                                   | Audit focus                                                                                                 |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Values, styles, opacity, offsets, thresholds, scale parameters and selection metadata | Mark uniform block in `baseProgram.js`, fed by Core `webGpuSurface.js` and renderer slot handles          | Retained setters, dependency-specific evaluation, packing and batched dirty uploads for every slot kind     |
| Viewport, DPR, cull bounds, placement index/clip/count and order pass                 | Per-occurrence dynamic-offset uniforms in `renderer.js`                                                   | Repacking/uploading identical frames; preserve visible/picking and detached-export differences              |
| Composite opacity                                                                     | Dynamic-offset uniforms in `renderGroups.js`                                                              | Used-span packing/upload and safe reuse across changing scope sequences                                     |
| Palettes and dash patterns                                                            | Actual data textures in `scaleResources.js` and `ruleProgram.js`                                          | Sampling/building payloads, unchanged updates, repeated consumers, texture identity, uploads and rebindings |
| Font and path atlases                                                                 | Shared GPU-generated textures in `outlineFontAtlas.js`, `msdfAtlasTexture.js` and `sparseGpuPathAtlas.js` | Generation parameter uniforms/storage, copies, growth, stable coordinates, borrower updates and lifetime    |
| Categorical domains, gap cuts, ordinal ranges and selections                          | Storage lookup buffers in `scaleResources.js` and `selectionResources.js`                                 | Normalization/hash preparation, retained membership, capacity, upload/rebind and sharing costs              |
| Placement and text lookup data                                                        | Storage buffers in `renderer.js`, `textProgram.js` and `pathPointProgram.js`                              | Snapshot/packing/upload triggers and reuse of glyph/metric/string/render-item tables                        |

Storage lookups are included because they carry data that WebGL often supplies
through textures. Rectangle hatches are procedural; their input parameters
belong in the mark-data audit. Picking, MSAA and composition attachments are
render outputs: account for their binding/target interactions with inputs,
without turning this task into a rasterization or shader-algorithm optimization.

Ground the comparison in WebGL `webGlMark.js` (captured setters and dirty Mark
blocks), `rendererResources.js` (shared scale tables) and `webGLHelper.js`
(range/selection texture ownership). WebGL also uploads View uniforms per
occurrence; do not assume that it already caches every unchanged frame.

- [ ] Trace each class from public input to GPU resource. Separate initial
      creation, unchanged redraw/navigation, changed-value updates, membership
      changes and growth. Exercise style/selection edits and text/palette
      changes as well as zoom/pan; equal initial values alone do not justify
      sharing.
- [ ] Attribute evaluation, normalization, packing, allocation/rebinding, upload
      calls/bytes and GPU generation/copies separately by resource class.
      Compare against WebGL and the unchanged WebGPU baseline on the same
      workload. Reuse existing tooling; its interaction driver sets `profile=1`,
      and `--no-trace` does not disable that profiler. Use separate verified
      profiler-disabled, alternating warmed runs and a same-version noise
      control to judge whole-thread CPU and cadence.
- [ ] Separate public-renderer dispatched-update costs from Core integration.
      Core's `webGpuSurface.js:updateResourceBindings` already filters unchanged
      range leaves, while `scaleResources.js` still uploads every dispatched
      table/palette payload. Use realistic direct-API or config-replacement
      workloads for proposed renderer guards, and check their comparison
      overhead on ordinary Core navigation. Label benefits by workload; removing
      an upload Core already avoids is not evidence of an integrated application
      gain.
- [ ] Select the smallest justified changes within the existing API. Concrete
      candidates include unchanged occurrence-global reuse, avoiding repeated
      palette/lookup payload construction, and retaining common input
      preparation for consumers whose semantic identity is already available.
      Audit mark values/properties/selections with the same care as scales. Keep
      one source of truth; do not add a generic cache or parallel invalidation
      registry.
- [ ] Preserve mutable input and callable-palette semantics in any reuse guard.
      Snapshot or compare contents where needed, including reused arrays with
      changed nested colors. The same `ColorInterpolatorFn` can produce
      different colors after captured state changes, so a repeated explicit
      range update must still observe its new output. Neither object/function
      identity nor a frozen outer array proves immutable contents. Add these
      regressions only when modifying the corresponding data path.
- [ ] For occurrence-global reuse, track the contents last uploaded into the
      actual GPU buffer. Live rendering, picking (`forceAll`) and detached
      export share and overwrite that buffer; remembered frame identity alone is
      insufficient. Extend `renderer.test.js` with a representative live →
      picking/export → live transition and invalidate reuse when buffer capacity
      grows. Preserve target-local DPR, viewport/culling, placement and
      order-pass values, as well as individual-slot and batch timing.
- [ ] Compare one contiguous dirty uniform span with whole-block batching only
      if transfer cost warrants it. Preserve device alignment, integer bits,
      ordering and valid minimum sizes, and avoid multiplying small uploads.
      Sharing must preserve mutable input semantics and last-consumer disposal;
      atlas growth must refresh borrowers without destroying in-flight
      resources.
- [ ] Record each class as improved, already adequately retained, or deferred
      with evidence. Keep changes for repeatable benefit beyond observed noise
      and a clear production-line/maintenance tradeoff; counters alone do not
      establish an application speedup. If a worthwhile candidate needs an API
      change, stop that candidate at a proposal and obtain permission first.

Outcome: full coverage of GPU input-data efficiency, with focused improvements
and tests where evidence supports them. Each selected change forms a coherent
milestone with the affected owners/consumers, representative verification from
milestone 2, size measurements and an internal implementation review. Tentative
messages include `perf(webgpu-renderer): retain unchanged draw uniforms` or
`perf(webgpu-renderer): reuse unchanged lookup data`, depending on actual work.
Internal changes need no public migration; API changes require a separately
approved proposal and its documentation/declaration work before implementation.

### 4. Prepare the foundation for delivery

- [ ] Address actual implementation review findings; use an independent review
      for substantive integration changes. The requested independent plan review
      and its resolutions are recorded below.
- [ ] Reassess the final release impact with `write-genomespy-changeset`; the
      current unpublished-only implementation has no fragment. Update the PR's
      validation and measurement claims to match the final branch.
- [ ] Reconcile completed/discarded plan tasks, retain that record in branch
      history, then remove this temporary plan in a later commit before merge,
      following `prepare-genomespy-change`. Tentative retirement message:
      `chore: retire completed WebGPU retained-update plan`.
- [ ] Deliver #659 before #660; retarget #660 to master after the foundation
      lands. Preserve any remaining SampleView discussion/testing on that upper
      PR.

Done means the foundation integrates with current master, every GPU input-data
class has an explicit efficiency assessment, and selected improvements preserve
the current API, live updates, placements, picking and resource disposal. Pass
applicable checks and report only measured benefits. Whole-application
acceleration is not an acceptance claim supported by the existing measurements.

### Independent plan review — 2026-11-04

A subagent reviewed the plan against the rebased code and the user's API
constraint. No blocking architecture or API issue was found. Addressed its three
findings: mutable/callable input validity, actual shared-buffer upload history
across live/picking/export passes, and separate direct-renderer versus
Core-filtered performance evidence. Also reconciled historical
validation/release statements and recorded the completed post-rebase tests and
types. No renderer code or API was changed during this review.
