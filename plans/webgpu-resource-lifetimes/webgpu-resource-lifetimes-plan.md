# WebGPU resource ownership and frame lifetimes

Status: deferred follow-up proposal, November 5, 2026. No implementation belongs
in #659/#660, and no API change is authorized by this document. Current source
baseline is `b1fe5f263`; the SampleView integration is on stacked head
`721b33fda`.

## Recommendation

Keep marks, typed columns, scales, clipping, compositing and picking in the
renderer. Improve the identities and lifetimes that callers can express:

1. After API approval and a useful CPU result from a bounded prototype, consider
   explicit shared scale resources and lightweight binding sets in the separate
   end-to-end PR tracked by
   [#698](https://github.com/genome-spy/genome-spy/issues/698).
2. Consider renderer-owned prepared frames only after CPU attribution shows that
   retaining topology across the Core/renderer boundary warrants the new
   contract. This should be a different PR from shared scales.
3. Use completed Core mappings to publish changed shared state directly. Do not
   add another per-binding source-token guard or a general dirty registry.

The aim is to prepare shared data once and preserve stable draw structure,
without transferring shader layouts or GPU synchronization into Core.

The completed [CPU attribution investigation](cpu-attribution-results.md) has
not cleared the gate for a broad shared-scale implementation. Shared-band
fan-out is confirmed, but the measured metadata envelope includes local work and
observer overhead. Keep the current API. A bounded shared-band prototype remains
an option after explicit API approval if resolving its benefit is worth the
experiment; the attribution alone neither accepts nor rejects that prototype.

## Findings and architectural fit

The abstraction level itself does not explain the performance gap. The public
API already exposes direct retained setters and synchronous consumption of
numeric scratch inputs. Core chooses to bridge live getters through generic
read/compare/write bindings. Replacing that bridge is possible without a new
renderer API, but its useful CPU benefit has not been established.

| Current owner/path                                                      | Finding                                                                                   | Consequence                                                           |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `webgpu-renderer/src/index.d.ts:264`                                    | Mark handles expose direct retained slots.                                                | Raw uniform offsets are not needed for direct updates.                |
| `core/src/marks/mark.js:576` and `webGpuSurface.js:375`                 | Scale mapping changes become one mark-wide revision, then a binding scan.                 | Some work is integration policy, not an API requirement.              |
| `baseProgram.js:317` and `scaleResources.js:115`                        | Each mark owns a scale manager and aggregate table buffer.                                | One shared Core scale has no shared GPU resource identity.            |
| `webGpuRenderCoordinator.js:35` and `webGpuViewRenderingContext.js:188` | Core already compiles a retained plan per settled layout.                                 | Do not add another view hierarchy or Core topology cache.             |
| `webGpuViewRenderingContext.js:236` and `renderer.js:950`               | Core replays the plan into items; the renderer normalizes and layerizes them each render. | A prepared boundary could remove repeated structural translation.     |
| `renderer.js:562`                                                       | Per-occurrence globals already use one staging traversal and one upload.                  | Another global-write batching proposal would duplicate existing work. |

Paths in the table are relative to `packages/`, with backend sources under
`core/src/rendering/webgpu/` and renderer sources under
`webgpu-renderer/src/marks/programs/internal/` unless otherwise named. Relevant
ownership rules are in
[rendering architecture](../../packages/core/docs/architecture/rendering.md) and
[reactivity architecture](../../packages/core/docs/architecture/reactivity.md).
Core owns semantics, settled mappings, layout, culling and view disposal. The
renderer owns packing, GPU resources, pipelines, physical render passes and
retained input storage. App continues using Core scales and placement sources.

### Evidence and limits

The
[existing investigation plan](../webgpu-direct-updates/webgpu-direct-updates-plan.md)
records the native interaction measurements and rejected implementations.
Earlier four-pair trials of passive scale-source guards measured +4.24% moderate
/ +0.26% stress CPU; scalar placement clipping measured -0.09% / +4.84%. Both
were reverted. These results do not establish causal regressions, nor do they
establish that a direct producer-to-slot integration cannot help.

The final frame-local draw-handle reuse trial measured -3.95% moderate and
+2.47% stress CPU across four pairs per scene, with mixed moderate results and
three higher stress candidate pairs. It was also reverted. Six rejected local
preparation experiments now total 92 timed native interaction traces. Keep the
accepted runtime in the current PR; these proposals remain separate experiments
requiring explicit API approval and performance evidence.

Reuse the existing diagnostic because the relevant runtime is unchanged. The
1000-us stress profile attributes 78.175 ms inclusive sampled wall time to
renderer normalization, 169.609 ms to Core occurrence submission and 185.799 ms
to renderer item encoding. Inclusive rows overlap. `updateResourceBindings` has
only 6.249 ms self sampled wall time; this excludes its callees. Half the
non-idle sample weight is categorized as browser/other, including unattributed
program samples. This is not a complete CPU decomposition or an upper bound on
the gain from any proposal.

The allocation sample's 38.98% share for `#normalizeDraw` is not a CPU share. Do
not infer a speedup from fewer JavaScript objects, uploads, bindings or lines.
The proposal identifies removable work; implementation needs separate CPU
evidence before claiming an improvement.

Diagnostic artifacts under the upper worktree's ignored
`output/sample-view-band-benchmark/` use
`sampleview-owned-containers-before-profile-*` and
`sampleview-current-stress-allocation-*`. Latest rejected CPU trials use
`sampleview-scale-dispatch-cpu-*` and `sampleview-placement-scalar-cpu-*`.

## Comparable established designs

- [luma.gl uniform guidance](https://luma.gl/docs/api-guide/gpu/gpu-uniforms)
  describes sharing uniform buffers across pipelines. Its
  [UniformStore](https://luma.gl/docs/api-reference/core/uniform-store)
  separates typed value storage from managed buffer publication. Reuse that
  ownership principle, not a second generic property-merging framework.
- [Three.js BundleGroup](https://threejs.org/docs/pages/BundleGroup.html)
  explicitly identifies stable structure and requires invalidation when it
  changes. Apply the stable-structure contract to ordered renderer commands,
  without importing a scene graph, transforms or view semantics.
- The [WebGPU specification](https://www.w3.org/TR/webgpu/#gpubindgrouplayout)
  requires compatible binding layouts; the default bind-group limit is four. The
  current renderer uses globals, mark resources and optional placement.
  Therefore do not allocate a bind group for every scale.
- [Native render bundles](https://www.w3.org/TR/webgpu/#bundles) reuse recorded
  commands, but do not expose per-draw viewport/scissor commands. Changing draw
  ranges, bindings, selection passes and isolation can also change commands. A
  prepared semantic frame must not be equated with a reusable GPU bundle.

These are design comparisons; no third-party implementation is copied.

## Proposal A: shared scale resources

### Early performance gate

The same performance discipline applies to shared scales as to prepared frames.
Existing attribution does not establish that duplicated scale preparation is a
large enough CPU cost to justify this feature. Another bind group adds work per
draw, and the small binding-scan self sample is neither a full scale CPU cost
nor evidence of a substantial opportunity.

Before the broad shader/resource rewrite, establish the CPU share and fan-out of
common scale preparation in representative native interactions. If attribution
cannot resolve the expected benefit, an API-approved, bounded shared-band
prototype must include Core/App metadata integration and a native CPU
comparison. Expand the generic feature to continuous and texture-backed scales
only if that vertical result supports the machinery. Fewer uploads, buffers or
subscriptions alone do not pass this gate. Discard a flat or regressing
prototype.

### Public contract

Introduce a renderer-owned `SharedScaleHandle` and an immutable
`ScaleSetHandle`. Names and syntax below are illustrative proposed API, not
existing exports. A scale handle owns its common mutable state and GPU
representations. A set is an ordered binding view over handles; it neither
copies their tables nor packs a second copy of their uniform values.

```js
// Stable numeric category IDs; display labels remain outside the renderer.
const rowIds = new Uint32Array(categoryIds);
const rows = renderer.createScale(
  bandScale({ domain: categoryIds, gapPositions: groupCuts })
);
const sidebarScales = renderer.createScaleSet({ rows });

const labels = renderer.createMark(textMark, {
  sharedScales: sidebarScales,
  channels: {
    y: {
      data: rowIds,
      type: "u32",
      scale: { source: "rows", range: [height, 0], band: 0.5 },
    },
    // Other channels keep ordinary mark-local scales and values.
  },
});

rows.batchUpdates(() => {
  rows.setViewport({ interval: [first, last], gapRanks: [r0, r1] });
  rows.setGapWidth(gapWidth);
});
```

The same set can be referenced by label, cell and background marks. A different
set may reference `rows` together with another shared scale, while retaining the
exact same `rows` buffers. One draw binds at most one shared scale set.

| Shared state                                     | Channel-local interpretation                |
| ------------------------------------------------ | ------------------------------------------- |
| Domain membership/order and categorical lookup   | Effective output range and reversal         |
| Rank viewport and gap ranks                      | Band position, including start/center/end   |
| Gap cuts and common gap width                    | Axis/placement-dependent conversion factors |
| Common scale parameters with identical semantics | Explicitly supported local configuration    |
| Identical range tables/textures when shared      | Independent metadata color and x scales     |

Do not share entire existing band configurations: Core currently folds range,
reversal, band position and alignment interpretation into individual channels.
Ownership must be explicit for every parameter. A local reference cannot
silently override common mutable state. The generic design must cover built-in
uniform, storage-table and texture-backed scale resources; it must not commit to
implementing that whole scope before the shared-band vertical prototype passes
the early CPU gate. The eventual independent feature needs standalone examples
for band navigation, a continuous domain and shared color. Custom scale
definitions need an explicit supported contract; reject unsupported shared
definitions at preparation rather than silently copying resources.

Setters validate and consume numeric inputs synchronously, as current retained
setters do. Each changed shared resource is packed/published once, irrespective
of its borrower count. This does not mean one GPU API call for every possible
multi-buffer resource. Ordinary content updates preserve compatible buffers and
bind groups; storage growth rebuilds only sets referencing that buffer. Resource
IDs and domain contents must not enter shader or pipeline cache keys.
Schema/type/layout shape does.

### Core grouping and integration

1. During retained layout/resource compilation, collect participating
   `ScaleResolution` identities and their distinct logical mark consumers.
   Repeated draw occurrences of one mark already share its current resources.
2. Keep single-consumer scales mark-local initially. For shared candidates,
   identify the common representation and exclude target/channel-derived state.
3. Form deterministic exact co-use sets for each mark and deduplicate identical
   sets. For SampleView, `{rows}` is sufficient even when each metadata column
   has its own local x/color scales. Do not add those independent scales merely
   to make every view use the same complete set.
4. Respect total per-stage buffer/texture/sampler limits as well as group count.
   The Core planner selects a bounded subset for sharing and leaves the rest
   local; explicit over-budget renderer sets fail with a diagnostic. Start with
   deterministic reuse count and canonical order, not global graph optimization
   or a renderer-wide storage arena.
5. Observe each shared resolution's existing completed mapping once. Publish
   changed common leaves to its handle after graph settlement. Regroup only when
   consumers/schema change, not on domain, viewport or gap-width changes. Delete
   the corresponding per-mark shared-state getters/bindings instead of
   preserving two update paths for those same inputs.

Publishing shared mappings is a live-state mutation. Before the first such
mutation outside `renderAll`, Core must invalidate pending pick results through
its existing interaction owner, then publish the settled state and schedule the
render. Coalesce this at the owning publication boundary; add no second pick
epoch or renderer dependency on Core. Merely calling `markPickingDirty` or
scheduling an animation frame is insufficient: the former only dirties the GPU
framebuffer, while Core's existing stale-result token normally advances in
`GenomeSpyBase.renderAll` (`genomeSpyBase.js:977`).

Shader generation must use source-aware parameter and table expressions.
`scaleEmitUtils.js:35` currently emits `params.*`; band emitters do likewise,
and `markShaderBuilder.js:780` names mark-local `scaleTables`. Generalize their
accessors while retaining one implementation of each scale formula. The renderer
selects physical group indices and caches compatible layouts; Core supplies
semantic sharing/co-use, not WebGPU descriptors or numeric bindings.

Core's Surface owns resolution-to-resource bindings and borrower lifetimes.
Destroying one mark must not destroy shared state used by another. Release
marks, sets and mapping subscriptions before their last resource owner; explicit
destruction of a still-borrowed resource should fail clearly. Handles belong to
one renderer/device, including its same-device detached targets.

Physical scale replacement retains the Core resolution dependency but may change
the renderer schema. Replace incompatible handles/sets/programs at that
boundary. A target-dependent export mapping must not alias live navigation state
solely because its Core resolution identity matches.

Choose **target-local mark handles and resource ownership for export** in the
initial shared-scale design. Sets attach immutably at mark creation, so export
draws use export-owned handles attached to their export sets rather than
temporarily rebinding the live marks. The export owner also owns any placement
representations that would otherwise change live mark state. Keep using the same
renderer/device and its compatible pipeline/font caches; do not introduce a
set-rebinding API and restoration ledger alongside this path.

After submitted export work finishes, dispose any prepared export frame, then
release export marks, their sets, scale/placement resources and finally the
target. Use the same cleanup path on failure, without destroying live borrowers
or masking the original error. Preserve existing export serialization. The
public export facade already restores Core's live layout/rendering in `finally`
(`genomeSpyBase.js:851` and `:898`); retain that restoration, rather than
assuming it also releases new export-owned borrowers. Verify successful and
failed exports followed by live picking.

The cost is temporary duplication of mark-local GPU buffers during export.
Measure peak memory on a real large export; this is a deliberate cold-path
tradeoff for explicit isolation, not a claim of a free optimization. If that
cost is unacceptable, return with a concrete compatible-rebinding proposal
instead of silently adding both ownership paths.

## Proposal B: prepared semantic frames, gated

Add a renderer-owned, target-bound frame that consumes ordered topology once and
exposes stable draw/scope slots. This is a compiled command description, not a
view hierarchy or a frozen physical pass list. Keep ordinary transient frames as
a convenience interface over the same compiler/encoder, rather than maintaining
two rendering implementations.

Illustrative shape:

```js
const frame = renderer.prepareFrame({
  draws: [{ enabled: false }],
  items: [{ bounds, items: [{ draw: 0 }] }],
  pickingOrder: [0],
});

// First activation can happen after data loading or offscreen reentry.
frame.draws[0].setMark(mark);
frame.draws[0].setRange(firstInstance, instanceCount);
frame.draws[0].setViewport(x, y, width, height);
frame.draws[0].setEnabled(true);
renderer.render(frame);
```

The constructor consumes/copies descriptors. Setters consume numerics into owned
state; no caller object is retained as a live input. Scalar setters avoid
requiring freshly allocated patch objects. Only actual field changes dirty
derived state. Scope slots expose bounds/opacity; draw slots cover activity,
logical range, viewport, scissor/cull bounds and placement selection. Start with
fixed order/membership; structural changes replace the frame.

Disabled, unbound slots have a precise purpose: Core does not create GPU marks
until an occurrence is accepted. Enabling an unbound slot fails. Avoid eager
hidden-mark allocation or rebuilding topology for ordinary offscreen reentry.
`setMark` initializes a dormant slot once; replacing an already-bound program
rebuilds the frame in the initial design. Frame-owned slot arrays need no global
draw-slot registry or resource-ID lookup on every setter.

### Lifetimes that cannot be omitted

| Change                                                  | Required behavior                                                                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Ordinary geometry, culling, x-index range or visibility | Update slots without rebuilding semantic topology. Core still computes these values.                                         |
| Scope opacity 0/1/fractional or child activity          | Recompute affected physical layerization and bounds.                                                                         |
| Conditional selection activity                          | Refresh one-versus-two ordered color passes, even without a draw-slot mutation.                                              |
| Series replacement                                      | Revalidate count and resolve logical ranges against current data. Text glyph offsets can change with unchanged string count. |
| Placement replacement/growth/shrink                     | Refresh derived clipping, current count and bind-group identity. Geometry changes are not topology changes.                  |
| Renderer mark/program replacement                       | Rebuild the prepared frame initially; avoid a cross-frame slot-rebinding framework.                                          |
| Target size/DPR or structural order/membership          | Rebuild the target-bound frame.                                                                                              |
| Detached export                                         | Use a separate target-local frame; do not select it as the live or explicit picking frame.                                   |
| Disposal                                                | Release frame CPU state independently, reject subsequent use and invalidate references to destroyed resources.               |

Core color and picking orders are not interchangeable. Color uses coalesced
`#renderCommands`; picking uses original `#paintCommands`. The proposed explicit
`pickingOrder` references the same slots in their original paint order. Picking
participation can differ from color activity and must remain explicit.

Choose live renderer-owned state for the new prepared-frame mode: setters change
that frame and invalidate picking derived from it. Do not promise a frozen
historical draw snapshot or silently allocate a second complete frame on every
commit. Existing transient render calls retain their current detached input
semantics. Mark/scale resources remain mutable retained resources, not
historical copies of the last color image.

Core must apply the same before-mutation pending-pick invalidation boundary as
for shared scale publications. Updates performed inside `renderAll` already
follow its invalidation point; independently published updates cannot rely on
the next animation frame to invalidate an older readback. If synchronous pick
preparation itself changes state and invalidates pending results, capture the
new request token **after preparation**. Today's explicit pick path captures it
before `renderPickingFramebuffer` (`interactionController.js:187`), so simply
inserting invalidation there would invalidate the new request itself.

Keep standalone renderer semantics separate: its `pick` promise returns a raw ID
or null, not Core's `invalidated` status. An already submitted readback
corresponds to the submitted state; the Core host rejects an obsolete result
before resolving it against current view/data state. Do not imply that dirtying
the GPU picking buffer cancels in-flight promises.

Dynamic resource dependencies prevent a universal normalize-once promise.
Existing custom programs may resolve ranges dynamically; either keep resolving
those ranges at use or propose a clear revision contract before caching them.
Built-in text needs series/range invalidation, and resource growth must update
bindings. Use resource-owned notifications/generations where required, not
per-binding deep snapshots. The prepared-frame experiment must account for the
cost of this machinery as well as the traversal it removes.

Core integration would compile renderer topology alongside its existing frame
plan, publish dynamic occurrence fields to the corresponding slots, and delete
per-paint scope/item reconstruction. Keep view hooks, mark/data preparation,
culling, range queries and layout ownership in Core. Global packing, physical
layer decisions and GPU command encoding remain renderer work. Do not promise
O(changed-fields) rendering or an automatic reduction in draw calls.

## Alternatives and tradeoffs

- **Lower-level raw buffers/uniform offsets:** gives Core control but duplicates
  renderer layouts, packing, shader specialization and lifetime rules. Reject as
  the general integration contract.
- **Identity caching of public frame objects:** cannot distinguish unchanged
  values from mutations and weakens validation/ownership. Reject.
- **Direct Core push bindings with today's slots:** possible without API change.
  Do not infer their benefit from the failed passive guard. Consider only if
  attribution identifies the current pull bridge as material; shared-resource
  integration already supplies the natural producer-to-owner path.
- **One bind group per scale / one union of every scale:** respectively exhausts
  groups or binding limits and can increase binding work. Prefer bounded co-use
  sets referencing independent resources.
- **Renderer-wide packed scale arena:** may reduce binding counts but adds
  relocation, addressing and allocator policy. Defer until explicit limits or
  measured workloads require it.
- **GPU bundles first:** cache the wrong lifetime for changing ranges/scissors
  and isolation. Revisit only for proven stable command runs after profiling.

Shared scales add ownership and shader-source indirection but remove duplicated
per-mark state and update paths. Prepared frames add lifetime/invalidation
contracts and retained CPU storage but could remove repeated topology work.
Neither is justified merely because it looks more direct. Count the whole
renderer/Core change, including deleted code, before accepting SLOC growth.

## Delivery and acceptance

### Milestone 1: shared scale feature and Core/App integration

- Entry gate: establish material duplicated scale CPU work, or, after API
  approval, demonstrate a useful gain with the bounded shared-band Core/App
  prototype. Do not begin the full multi-kind shader rewrite first.
- Outcome: an independently usable shared resource/set API, source-aware shader
  access and one completed-mapping publisher per shared Core scale.
- Areas: public renderer types/factories, scale resource management, shader
  emission/layout/cache keys, Core Surface/adapter lifecycle and SampleView's
  existing scale integration. App must not construct GPU resources.
- Verification: standalone band, continuous and texture-backed examples;
  multiple sets sharing one buffer; local independent scales; conditional
  channels; buffer growth; physical scale replacement; disposal; empty/reentry;
  grouped metadata/label alignment, picking and detached export followed by live
  interaction. Exercise real MCCA grouping, scrolling, sort/filter/undo and
  threshold changes plus the moderate/stress fixtures and 40-heatmap scene.
  Include a delayed pick completed after a mapping mutation but before the next
  animation frame, export failure cleanup, and peak export memory.
- Documentation: renderer API/examples and Core integration notes; assess
  release impact against the final shipped change. Unpublished backend-only work
  alone requires no fragment.
- Tentative commit: `feat(webgpu): share scale resources across marks`.

### Milestone 2: prepared-frame vertical experiment, only if warranted

- Entry gate: separate CPU attribution must show material work in repeated
  structural translation/normalization, rather than only allocations or native
  command encoding. Use the existing native drivers/profiling support.
- Outcome: one renderer compiler/encoder shared by transient and prepared
  frames, with Core adopting stable topology and deleting its item rebuilding.
- Areas: public frame/slot types, renderer normalization/planning/picking and
  detached target handling, resource invalidation, Core frame-plan lifecycle.
- Verification: compare transient/prepared output and picks; lazy initial
  activation; directional clips/fractional DPR; opacity/selection transitions;
  unchanged-count text replacement; placement growth/shrink; target resize; mark
  replacement; distinct color/pick order; export/live isolation. Run the same
  real App interactions and representative independent renderer examples. Cover
  delayed picks across slot mutations and a pick whose preparation changes state
  without invalidating its own newly captured request.
- Documentation: precise input, live-update, picking, destruction and migration
  contracts. If it does not remove enough measured work, discard the experiment.
- Tentative commit: `perf(webgpu): retain prepared frame topology`.

Both milestones require warmed alternating native-input CPU comparisons with
normal profiling/samplers/observers disabled, matching same-code controls and
output/membership/input/settling checks. Diagnostic counts and profiles run
separately. Require a repeatable useful gain larger than control variation and
no material regression in the other representative workload. Small SLOC growth
requires substantial gains; choose the simpler implementation when differences
are not measurable. Report CPU, size and memory tradeoffs independently.

## Open decisions and approval boundary

Before implementation, confirm the exact shared-reference syntax, common/local
parameter split, custom scale capability contract, bounded set selection and the
target-local export memory tradeoff. For prepared frames, confirm live
owned-state semantics, dormant slots, explicit pick order and dynamic resource
invalidation before committing to the API. Do not combine both milestones into
#659/#660 or treat this proposal as permission to change their current renderer
API.

## CPU attribution investigation

The user authorized the early attribution step after reviewing this proposal.
Use the current stacked runtime at `721b33fda` and existing native stress input
driver, with unchanged sample membership, grouping, wheel/pan/closeup actions
and error/settling checks. No renderer API or repository runtime edit is needed.

Temporary browser response transforms add synchronous trace scopes. A probe on
the installed Chrome confirms `console.timeStamp` events include `tts`, the
thread CPU timestamp, while CDP `Performance` can report `threadTicks` totals.
Compute paired CPU deltas from `tts`, not elapsed `dur` or JavaScript sampling
weights. Require one renderer-main-thread identity, balanced nesting and
monotonic clocks. Attribute self CPU to the innermost phase for disjoint totals;
inclusive phase rows must not be added together.

Record Core mapping production/application and notification fan-out separately
from its consumer work. Consumer scopes cover binding reads/comparisons and
scale setters, including validation, staging and nested work. Deferred mark
uniform commits are classified from actual changed writers: shared-band-only,
other-scale-only, mixed, or no scale. Scale-derived values and semantic
thresholds are not shared GPU scale bindings. The entire retained-resource
synchronization scope is a conservative broader envelope, not pure scale CPU.

Also record Core replay/hooks/bounds, renderer normalization, global packing,
command encoding and submission. Distinct logical mark consumers and changed
leaves identify shared-band fan-out; repeated draw occurrences do not count as
independent scale owners. Count domain-map, range-texture and gap-table rebuilds
instead of assuming they occur during navigation.

This is CPU under diagnostic instrumentation, not an optimization acceptance
run. An empty-marker calibration describes marker cost; do not subtract a
guessed constant. A tracing-only original-source control and normal unsampled
CPU runs check diagnostic overhead. Source/served hashes, trace categories and
driver identity belong in the artifacts.

Completed: fourteen measured native interaction windows passed input,
membership/grouping, loading and settling checks. The sparse whole-metadata
envelope extrapolates to about 10% of instrumented main-thread CPU; its finer
scale-only breakdown remains too sensitive to observer overhead. Seventy percent
of metadata update batches also change local values, so sharing the scale alone
cannot eliminate those uploads. No shared-scale table rebuilds occurred during
warmed navigation. See the [results](cpu-attribution-results.md) for controls,
counts, interpretation limits and the decision to defer the broad
implementation. Runtime code and renderer API remain unchanged.

## Independent review

The user requested a separate subagent review after the initial proposal. Review
found three actionable gaps: pending-pick invalidation before live mutations,
export set/mark ownership and cleanup, and a missing early CPU gate for the
broad shared-scale feature. The revisions above address all three. Review
supports the shared-resource direction; it does not establish a measured speedup
or approve implementation. No production code or API was changed.

Retain this temporary proposal for draft discussion and retire it before the
implementation PR is merged.
