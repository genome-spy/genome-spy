# WebGL mark encapsulation follow-up plan

Status: Planned

## Context

The completed dynamic-WebGL project moved the legacy implementation under
`packages/core/src/rendering/webgl/` and removed it from Core's synchronous ESM
entry graph. It deliberately retained a small compatibility bridge so the
initial extraction could preserve behavior without redesigning dataflow and
mark lifecycle at the same time.

That bridge is now the main remaining WebGL deletion obstacle. Semantic
`Mark` instances store an opaque renderer delegate and forward initialization,
data updates, readiness, debugging, drawing, viewport setup, and disposal.
`ViewContext`, dataflow initialization, scale-resolution planning, font
loading, `UnitView`, and debug snapshots participate in the same retained
renderer protocol. Canvas2D and WebGPU do not use this lifecycle, so the
apparently generic contract is effectively a WebGL abstraction embedded in
shared Core.

Two consumers outside the main live-render coordinator also depend on the
bridge. App's dynamic metadata view explicitly finalizes graphics after adding
a subtree, while WebGL canvas export and hybrid SVG rasterization construct
their own `BufferedViewRenderingContext` instances. The Inspector consumes the
renderer readiness and allocation fields produced by mark debug snapshots.
These paths must migrate with the live renderer rather than being treated as
incidental test consumers.

Core's WebGPU adapter demonstrates the desired ownership direction:

- the backend owns retained handles keyed by semantic `Mark` identity;
- a completed `LayoutResult` is compiled into a backend-owned frame plan;
- collector and semantic rendering revisions control synchronization;
- the owning `UnitView` supplies a generic disposer registration point; and
- fonts cross the adapter boundary as metrics and bitmap URLs, not GPU
  resources.

This follow-up applies that ownership pattern to legacy WebGL without changing
`packages/webgpu-renderer/` or Core's WebGPU adapter. It is not a WebGL rewrite.
Shaders, vertex builders, draw callbacks, batching, and GPU resource layouts
remain as they are.

The existing post-extraction screenshots, large App captures, bundle report,
and WebGL interaction benchmark provide the starting reference. Before
production edits, record the follow-up starting revision and repeat the WebGL
thumbnail capture, both large App captures, and a WebGL-only interaction
benchmark so acceptance compares against the exact starting tree.

## Goals

- Make semantic `Mark` classes own only configuration, encoders, data-derived
  semantics, hit testing, and backend-neutral rendering revisions.
- Move WebGL delegate identity, initialization, synchronization, readiness,
  drawing, debugging, and disposal behind a WebGL-owned adapter.
- Remove `RendererResources`, `MarkRenderingDelegate`, and WebGL graphics
  lifecycle methods from shared `ViewContext` and semantic marks.
- Keep dataflow initialization concerned with encoders and semantic
  `initializeData()` work, not GPU resource creation or buffer updates.
- Make the WebGL module own range textures and font textures while preserving
  their current update and readiness behavior.
- Preserve generated GLSL, rendered pixels, draw ordering, picking, dynamic
  data, lazy visibility, raster export, hybrid SVG rasterization, and cleanup.
- Preserve approximately the current WebGL startup and steady-state
  performance.
- Leave a deletion boundary where removing WebGL does not require redesigning
  marks, dataflow, fonts, scales, or view disposal.

## Non-goals

- Changing any file under `packages/webgpu-renderer/` or
  `packages/core/src/rendering/webgpu/`.
- Changing renderer selection, fallback priority, raster export behavior, or
  hybrid SVG run selection.
- Implementing WebGPU hybrid SVG rasterization; GitHub issue #483 remains the
  separate owner of that work.
- Introducing a public renderer plugin API, common retained-mark interface,
  scene graph, or generalized resource framework.
- Rewriting, optimizing, polishing, or documenting the legacy WebGL renderer
  beyond what is needed to encapsulate it.
- Changing shader source, attribute layouts, buffer-capacity policy, or the
  existing WebGL batching order.
- Making Canvas2D or SVG retained renderers.
- Re-running WebGPU performance benchmarks. Representative WebGPU rendering
  is a compatibility smoke check only.

## Key decisions

### Extend the existing WebGL resource owner instead of adding a common layer

Replace the current factory-like `WebGLRendererResources` role with one
WebGL-internal mark adapter/registry. It may evolve in place or be renamed if
that makes ownership clearer, but it must remain private to
`src/rendering/webgl/`.

The adapter owns a `Map<Mark, Entry>`. Each entry contains the existing
`WebGLMark` delegate plus only the revisions and asynchronous state required
to synchronize it. A strong map is intentional: the adapter must be able to
dispose every live GPU resource deterministically. When an entry is created,
the adapter registers its release callback with the owning `UnitView`, using
the same established lifecycle pattern as `WebGpuSurface`.

An entry has an explicit `uninitialized`, `compiling`, `ready`, `failed`, or
`disposed` state. Compilation failure is terminal for that entry, retains the
owning-view error attribution, and releases partial delegate resources. Empty
data does not prevent shader readiness; it only leaves the entry without
drawable vertex ranges. Disposal changes liveness before deleting GPU objects
so already-compiled batches cannot invoke a released delegate.

Do not introduce a generic `RenderedMark`, `MarkRenderer`, or backend-wide mark
lifecycle interface. Canvas2D and WebGPU already work without the legacy
protocol, and formalizing it would turn transitional WebGL behavior into a
permanent abstraction.

### Let WebGL consume semantic marks instead of marks forwarding WebGL calls

`BufferedViewRenderingContext` records semantic marks and occurrence options.
After layout replay, the WebGL coordinator asks the adapter to prepare the set
of referenced logical marks and then builds the existing optimized draw batch.
The context resolves a delegate once per logical mark while building the batch;
individual draw operations continue calling the resolved delegate directly.

Every `BufferedViewRenderingContext` receives the same adapter explicitly.
This includes contexts created by the live coordinator, full WebGL canvas
export, and hybrid SVG run rasterization. Export paths use the same
prepare/finalize/synchronize rules as live rendering; they must not fall back
to semantic-mark forwarding or create a second delegate registry.

Preparation retains the current two-phase shader behavior:

1. create every missing delegate and start every shader compilation;
2. only after all compilations have started, finalize their programs and
   report compilation errors with the owning view attached.

An early layout pass that encounters a mark whose encoders or collector are not
ready records no drawable delegate. The normal post-data layout pass completes
it. A later completed collector must move the entry through synchronization
without requiring a new semantic mark. No shared pre-initialization callback is
added merely to retain the old call order.

Each compiled mark group captures the adapter entry as well as the delegate.
The first operation in that group checks entry liveness and effective opacity;
all preparation, viewport, and draw callbacks remain guarded by that result.
Thus, disposing a dynamic view between layout compilation and paint cannot
execute a stale delegate. The next layout drops the occurrence normally.

### Synchronize WebGL buffers from revisions before paint

The adapter synchronizes active entries before normal and picking rendering.
It rebuilds WebGL vertex data only when one of these inputs changes:

- collector identity or `Collector.dataRevision`;
- the existing mark configuration revision for expression-backed encoded data;
  or
- a new backend-neutral encoded-data revision for expression-backed mark
  properties that require CPU vertex regeneration in legacy WebGL.

Rename `setupExprRefsNeedingGraphicsUpdate` to describe semantic encoded-data
invalidation. Its watchers increment the encoded-data revision and request a
render; they never inspect a delegate or call a graphics method. WebGPU may
ignore the new revision and its existing adapter code remains unchanged.

The encoded-data revision covers the exact CPU-geometry inputs served by the
old direct update watchers, including base positional offsets and text's
`text`, `fitToBand`, and `logoLetters` properties. The configuration revision
continues to cover expression channel definitions. Collector completion from
no data to data is observed through collector identity/revision. Tests must
map every old `updateGraphicsData()` trigger to one of these three sources
before the forwarder is removed.

Do not use the broad resource revision for WebGL vertex rebuilds. Scale,
selection, opacity, and uniform changes occur frequently and already have
their own live WebGL update paths. Rebuilding vertex buffers for them would be
a performance regression.

Synchronization must preserve the identity behavior of the existing
`RangeMap` entries and lazy vertex-array recreation so cached normal and
picking callbacks remain valid when buffer contents or capacity change.

### Keep font entries renderer-neutral while preserving parallel loading

`BmFontManager` continues to own font metadata, metrics, fallback selection,
bitmap URLs, and the promise that makes text metrics safe before layout and
geometry generation. It must stop storing an opaque `rendererResource`.

To retain parallel bitmap loading without exposing a texture, the selected
backend may supply one optional promise-only bitmap preparation callback when
the font manager is constructed. The WebGL module implements it by starting or
reusing a texture load in an adapter-owned cache keyed by bitmap URL. Text
delegates resolve the actual `WebGLTexture` from that cache inside the WebGL
module. Canvas2D and WebGPU need no callback.

The callback returns readiness only; no GPU object crosses into `FontEntry`,
`ViewContext`, or shared font code. Backend destruction rejects or safely
settles outstanding loads and deletes every texture exactly once.

The WebGL adapter exposes a private `prepareFontBitmap(url)` and
`getFontTexture(url)` pair to its backend factory and text delegates. A custom
font whose bitmap succeeds but whose metadata fails must release or retain the
unused bitmap only according to normal cache ownership, then render with the
default font's metrics, bitmap URL, and texture. A late completion after
backend disposal must not publish a texture or request another render.

### Move scale-texture ownership into the WebGL adapter

Shared resolution planning creates and updates semantic scale resolutions only.
When preparing a WebGL delegate, the adapter discovers the resolutions used by
its encoders, creates any required range texture from the already-settled
scale, and subscribes once per resolution to domain/range changes.

Subscriptions are keyed by `ScaleResolution`, because that object owns the
events and lifecycle. Texture cache entries remain keyed by the concrete scale
identity used by shader encoders. The adapter reference-counts resolution
subscriptions across marks, removes a subscription when its last owning mark
is released or the resolution is disposed, and deletes/replaces the scale's
current texture exactly once. Backend disposal clears both identity maps.
Existing per-delegate scale-uniform listeners may remain inside WebGL marks,
but no scale planner or semantic mark may call a renderer resource manager.

### Split semantic and renderer debug state at the debug boundary

`Mark.getDebugState()` retains semantic properties and mark information only.
WebGL-specific readiness, uniform-dirty state, vertex counts, allocated
capacity, and range counts come from the WebGL adapter.

Add an optional read-only `getMarkRenderingDebugState(mark)` capability to
`RenderingBackend` and copy it into `ViewContext` during bootstrap.
`createMarkDebugSnapshot()` reads semantic state from `Mark`, renderer state
from the root context, and preserves its current public snapshot fields and
defaults. The Inspector continues calling the snapshot function with only
`getDebugId`; it does not need access to the backend or adapter. Canvas2D,
WebGPU, and headless contexts omit the capability and retain their current
absent/default renderer state. The callback returns plain data and exposes no
delegate object or lifecycle method.

### Fold adapter disposal into the WebGL backend

Per-mark resources are released through registered `UnitView` disposers. Full
backend finalization releases any remaining mark entries, scale subscriptions,
font textures, and then the WebGL surface. Keep this sequencing internal to the
WebGL backend factory/surface rather than retaining `rendererResources` on the
shared `RenderingBackend` type solely for disposal.

The adapter registers an internal finalizer with `WebGLHelper`; its
`surface.finalize()` remains the only shared shutdown call. Finalization runs
in this order:

1. mark entries and programs/buffers/vertex arrays;
2. resolution listeners and font, range, selection, and placement textures;
3. cached shaders and the picking framebuffer/attachments;
4. canvas-size observers and the canvas.

`WebGLHelper` must explicitly inventory iterable owned resources or maintain a
dedicated deletion set where its current weak maps cannot be enumerated.
Placement-source disposal callbacks must be unregistered or made harmless when
the backend finalizes first. Destruction during an in-flight backend launch and
normal view-first destruction both use the same idempotent finalizer.

### Delete the unused simple retained rendering context

`SimpleViewRenderingContext` is an illustrative class used only by its own
test and calls the legacy delegate methods directly on `Mark`. Delete it and
its test instead of moving it or preserving semantic-mark forwarding methods
for a non-production consumer.

## Alternatives considered

### Keep the delegate on `Mark` but hide it behind symbols or private helpers

Rejected because ownership and lifecycle would still point from semantic Core
into WebGL. It would reduce visible API surface without improving the eventual
deletion boundary.

### Add a generic retained-renderer lifecycle to every backend

Rejected because Canvas2D and WebGPU do not need the WebGL initialization,
finalization, buffer-update, viewport, or draw-callback protocol. The common
contract would be larger than the backend differences it conceals.

### Update WebGL resources directly from collector observers

Rejected as the primary synchronization mechanism because it couples dataflow
completion to the selected renderer and misses expression-only invalidation
unless shared marks call back into WebGL. Revision checks before paint keep the
dependency direction correct and are already proven by the WebGPU adapter.

### Rebuild WebGL vertex data on every render request

Rejected because zoom, selection, hover, and animation can request frames
without changing encoded data. Collector and mark revisions allow constant-time
checks while retaining the current buffer-update frequency.

### Load font textures only when the first text mark is drawn

Rejected as the default because it would serialize bitmap decoding after font
metrics and could make text appear a frame later than the current readiness
contract. A promise-only preparation hook preserves parallelism without
leaking textures.

### Reimplement WebGL marks using WebGPU adapter configs

Rejected because the legacy shaders, vertex builders, batching, and scale
resource model are intentionally temporary and different. Sharing those
representations would alter WebGPU and add a migration abstraction that must
later be removed.

## Milestone 1: Establish WebGL-owned mark identity and synchronization

### Intended outcome

WebGL delegates are owned, prepared, synchronized, and released by a private
WebGL adapter. Semantic marks no longer need to be the source of delegate
identity for the WebGL hot path.

### Work

- [ ] Record the starting revision and refresh the complete WebGL thumbnail
      set, both 1920 x 1080 private App captures, and the headed WebGL-only
      interaction benchmark before production edits.
- [ ] Extend or replace `rendering/webgl/rendererResources.js` with a private
      mark adapter that owns one entry per logical semantic mark.
- [ ] Register entry disposal through `UnitView.registerDisposer()` and make
      adapter-wide disposal idempotent.
- [ ] Change the buffered rendering context to record semantic marks and
      occurrences, then resolve delegates from the adapter while compiling its
      existing ordered batch.
- [ ] Pass the same adapter into live, full-canvas export, and hybrid-SVG
      rendering contexts and make all three paths use the same context finish
      and synchronization contract.
- [ ] Start all missing shader programs before finalizing any of them, preserve
      view-attributed error reporting, release failed partial delegates, and
      tolerate early pre-data and empty-data layouts.
- [ ] Add backend-neutral encoded-data invalidation to semantic marks without
      changing the existing WebGPU configuration/resource revision behavior.
- [ ] Synchronize vertex buffers from collector/configuration/encoded-data
      revisions before normal and picking paints.
- [ ] Preserve cached draw callbacks, `RangeMap` identity, buffer-capacity
      reuse, VAO recreation, opacity gating, culling, placement, and picking
      invalidation.
- [ ] Guard every cached mark group with adapter-entry liveness so dynamic
      disposal between layout and paint cannot call a released delegate.
- [ ] Route WebGL readiness and mark diagnostics through the adapter rather
      than delegate state stored on `Mark`.

### Affected areas and downstream consumers

- `packages/core/src/rendering/webgl/rendererResources.js`
- `packages/core/src/rendering/webgl/renderCoordinator.js`
- `packages/core/src/rendering/webgl/bufferedViewRenderingContext.js`
- `packages/core/src/rendering/webgl/canvasExport.js`
- `packages/core/src/rendering/webgl/svgRasterizer.js`
- `packages/core/src/rendering/webgl/marks/`
- `packages/core/src/marks/mark.js` and `packages/core/src/marks/text.js`
- `packages/core/src/debug/markDebugSnapshot.js`
- dynamic views in Core and App, including `SampleView`
- ordinary rendering, picking, SVG WebGL raster runs, and raster export

No WebGPU file changes.

### Verification

- Adapter tests cover one delegate per logical mark, two-phase initialization,
  initial and revised data upload, expression-driven encoded-data updates,
  normal/picking/export reuse, early and empty-data layouts, initialization
  failure cleanup, stale-batch liveness, and idempotent disposal.
- Existing shader snapshots remain byte-identical.
- Focused dynamic-data, hidden-view, placement, selection, picking, and mark
  buffer tests pass.
- Performance-profiler counters show no vertex-buffer rebuild for scale-only,
  selection-only, opacity-only, or unchanged animation frames.
- Diff-stat and line-count review confirms that the adapter replaces existing
  forwarding rather than adding a second retained-renderer hierarchy.

### Documentation and migration

Keep the temporary compatibility bridge only where milestone 2 still needs it;
mark it for removal in the same plan. No public API or specification migration
is expected.

Tentative commit: `refactor(core): let WebGL own retained mark state`

## Milestone 2: Remove the shared legacy renderer lifecycle

### Intended outcome

Shared marks, dataflow, fonts, scales, views, and backend types no longer know
about the legacy WebGL delegate protocol. WebGL is an implementation detail of
its dynamic module.

### Work

- [ ] Remove delegate storage and graphics initialization, finalization, data
      update, deletion, readiness, rendering, viewport, and disposal forwarders
      from semantic `Mark`.
- [ ] Remove `MarkRenderingDelegate`, `RendererResources`, renderer-resource
      loads, and `ViewContext.rendererResources` from shared types and context
      factories.
- [ ] Remove graphics promises and updates from dataflow initialization and
      delete `finalizeSubtreeGraphics` plus its orchestration and tests.
- [ ] Migrate App's dynamic metadata subtree initialization away from
      `graphicsPromises`/`finalizeSubtreeGraphics`; rely on adapter preparation
      during the next layout and preserve the metadata-generation race guard
      through view disposal.
- [ ] Keep collector observers responsible only for semantic
      `mark.initializeData()` and render scheduling.
- [ ] Remove `mark.dispose()` from `UnitView`; adapter-registered view disposers
      become the sole per-mark GPU cleanup path.
- [ ] Remove renderer updates from scale-resolution planning and make the
      WebGL adapter own initial range-texture creation, deduplicated updates,
      and listener cleanup.
- [ ] Remove `FontEntry.rendererResource`; retain metrics, bitmap URL, fallback,
      and readiness while moving texture storage and lookup into WebGL.
- [ ] Fold WebGL adapter cleanup into backend/surface finalization and remove
      the `rendererResources` disposal escape hatch from `GenomeSpyBase` and
      `RenderingBackend`.
- [ ] Make `WebGLHelper.finalize()` explicitly delete or disarm marks, programs,
      buffers, VAOs, font/range/selection/placement textures, cached shaders,
      picking framebuffer attachments, source callbacks, and size observers in
      the specified order.
- [ ] Preserve renderer diagnostics through the backend-to-view-context
      `getMarkRenderingDebugState` callback and keep the Inspector's existing
      snapshot fields without exposing the delegate lifecycle.
- [ ] Delete `SimpleViewRenderingContext` and its isolated test.
- [ ] Update tests and headless helpers to stop constructing no-op renderer
      resources.
- [ ] Update rendering and view/dataflow architecture documents to describe
      renderer-owned retained state and the actual WebGL deletion boundary.

### Affected areas and downstream consumers

- `packages/core/src/types/viewContext.d.ts`
- `packages/core/src/genomeSpyBase.js`
- `packages/core/src/genomeSpy/viewContextFactory.js`
- `packages/core/src/genomeSpy/headlessBootstrap.js`
- `packages/core/src/genomeSpy/viewDataInit.js`
- `packages/core/src/data/flowInit.js`
- `packages/core/src/view/viewUtils.js`
- `packages/core/src/view/unitView.js`
- `packages/core/src/view/resolutionPlanner.js`
- `packages/core/src/fonts/bmFontManager.js`
- `packages/core/src/fonts/textMetrics.js`
- `packages/core/src/debug/markDebugSnapshot.js`
- `packages/core/src/rendering/renderingBackend.js`
- `packages/app/src/sampleView/metadata/metadataView.js`
- `packages/inspector/src/inspectorSession.js`
- `packages/inspector/src/components/inspectorPanel.js`
- `packages/core/docs/architecture/rendering.md`
- `packages/core/docs/architecture/views-and-dataflow.md`

Canvas2D, SVG, headless usage, App view lifecycle, and the existing WebGPU
adapter are required downstream review targets even if their implementation
files do not change.

### Verification

- A source audit finds no `RendererResources`, `MarkRenderingDelegate`,
  `rendererResource`, `initializeGraphics`, `updateGraphicsData`,
  `getRenderingDelegate`, or equivalent delegate lifecycle in shared
  production code.
- WebGL font tests cover default, remote, fallback, shared-cache, load failure,
  custom-bitmap-success/metrics-failure fallback, destruction during loading,
  late completion, and exactly-once texture deletion.
- Scale tests cover initial textures after settled domains, shared-resolution
  deduplication, scale-versus-resolution identity, domain/range updates,
  resolution disposal, mark disposal, and backend disposal.
- Dataflow, lazy visibility, subtree replacement, dynamic view disposal,
  rapid App metadata regeneration, headless, Canvas2D, SVG, Inspector, and
  debug snapshot tests pass without no-op renderer fixtures.
- Existing WebGL shader, buffer, picking, export, and hybrid-SVG tests pass.
- Destruction during backend launch and normal view-first destruction release
  every inventoried resource once; late placement/font callbacks are harmless.
- No file under either WebGPU directory appears in the diff.
- Core's minimal and production ESM bundle checks retain the existing dynamic
  WebGL boundary; the compatibility UMD does not grow materially without a
  documented reason.

### Documentation and migration

Update internal architecture documentation only. This is an internal refactor
with no specification, schema, or user-facing API migration.

Tentative commit: `refactor(core): remove shared WebGL mark lifecycle`

## Final integration verification

Run focused tests during each milestone, then run the complete relevant checks:

```sh
npm test -- --reporter=agent
npm --workspaces run test:tsc --if-present
npm run lint
npm -w @genome-spy/core run build
npm -w @genome-spy/core run verify:bundle:minimal
```

The existing `gff-nostream` `GFF3Feature` declaration failure is acceptable
only if it remains byte-for-byte equivalent to the recorded baseline and no new
type error precedes it.

Repeat the complete WebGL screenshot suite in the same browser, DPR, and
environment as the pre-follow-up capture:

```sh
npm -w @genome-spy/core run capture:screenshots -- \
  --all --overwrite --renderer webgl --timeout-ms 120000
```

All deterministic screenshots must match exactly. Restore and separately
review the known `random()` examples, and treat the existing 10,000-rule stress
example according to its recorded baseline behavior.

Capture both large private App specifications at 1920 x 1080 and DPR 1 into a
new output directory. Then open both in the normal App with `renderer=webgl`
and repeat zoom, pan, hover/picking, tooltip, resize/scroll, and representative
App interaction checks:

- `private/genomespy-paper-2024-spec/spec.json`
- `private/MCCA-visualization/web/specs/spec.json`

Run focused raster-export and hybrid-SVG checks through WebGL and Canvas2D to
confirm that backend capability selection and paint ordering did not change.
Run representative Canvas2D and WebGPU render smokes to verify that shared
semantic-mark changes remain compatible. Do not run WebGPU performance
benchmarks and do not modify WebGPU files.

In App, repeatedly switch metadata configurations quickly enough to dispose a
generated metadata subtree before its successor finishes initializing. Confirm
that the final generation renders, stale generations create no WebGL entries,
and neither a stale batch nor late callback accesses disposed resources. Open
the Inspector against WebGL and a renderer-less/headless fixture and verify the
mark panel retains readiness, vertex/allocation/range, uniform-dirty, semantic
property, and default-value behavior.

Repeat the headed hardware-backed WebGL interaction matrix with the same MCCA
and control specifications, browser, viewport, DPR, cases, repetitions, and
trace settings used for the pre-follow-up baseline:

```sh
node packages/core/scripts/runWebGpuInteractionBenchmark.mjs \
  --spec private/MCCA-visualization/web/specs/spec.json \
  --control-spec examples/app/samples.json \
  --renderer webgl \
  --headed \
  --output-dir output/webgl-mark-encapsulation-final
```

Compare cadence medians, long-frame counts, normal and picking durations,
retained-resource/mark counters, correctness controls, and traces. A consistent
regression requires investigation even if it falls inside the previous coarse
A/A tolerance.

## Acceptance criteria

- Semantic `Mark` instances contain no retained renderer object and expose no
  WebGL-style graphics lifecycle or draw-forwarding methods.
- WebGL owns one retained delegate per logical mark, synchronizes it from
  semantic revisions, and releases it through view/backend lifecycle.
- Shared dataflow, font, scale, view, and context code never receives a WebGL
  delegate, texture, helper, or renderer-resource manager.
- Live rendering, full WebGL canvas export, and hybrid SVG rasterization share
  the same adapter registry and cannot call removed semantic-mark forwarders.
- Deleting `src/rendering/webgl/` would require removing its dynamic factory and
  optional backend capabilities, not redesigning semantic marks or dataflow.
- Generated GLSL and all deterministic WebGL screenshots remain identical.
- Dynamic data, expression-backed encoded values, shared scales, selections,
  fonts, hidden/lazy views, dynamic subtree disposal, picking, raster export,
  and hybrid SVG rasterization preserve current behavior.
- App metadata subtree replacement and Inspector mark diagnostics preserve
  current behavior.
- Canvas2D, SVG, headless, and representative WebGPU rendering remain correct.
- No code under `packages/webgpu-renderer/` or
  `packages/core/src/rendering/webgpu/` changes.
- Full tests and lint pass. Type/build checks introduce no failure beyond the
  recorded `gff-nostream` declaration issue.
- ESM WebGL isolation remains enforced, UMD size does not grow materially, and
  headed WebGL interaction performance has no unexplained material regression.

## Risks and mitigations

- **Shader finalization becomes serialized too early.** Collect all unique
  marks and start every compilation before checking any program status.
- **Cached batches render stale data.** Synchronize adapter entries before both
  normal and picking paints using collector and semantic revisions.
- **Cached batches retain a disposed delegate.** Mark entries inactive before
  releasing resources and guard every compiled mark group by entry liveness.
- **Broad resource revisions trigger buffer churn.** Add a narrow
  encoded-data revision and verify that scale, selection, opacity, and idle
  frames do not rebuild buffers.
- **Early layout encounters uninitialized marks.** Keep those occurrences
  pending/no-op and materialize them during the normal post-data layout.
- **Font textures finish after readiness is announced.** Preserve parallel
  bitmap preparation with a promise-only backend hook and keep textures inside
  the WebGL cache.
- **Shared scales cause duplicate texture uploads or listener leaks.**
  Deduplicate subscriptions per resolution and verify reference release.
- **View disposal and backend disposal race.** Make entry and adapter disposal
  idempotent and test both orders, including in-flight font loads.
- **Weakly keyed helper caches cannot be finalized by iteration.** Maintain an
  explicit owned-resource inventory and disarm placement-source callbacks
  before tearing down the GL context.
- **Debug behavior silently loses renderer information.** Preserve the current
  snapshot fields through a read-only adapter callback and test both WebGL and
  renderer-less snapshots.
- **A registry lookup enters the per-occurrence hot path.** Resolve once per
  logical mark while compiling the batch and retain direct delegate callbacks
  thereafter.
- **The cleanup grows into a permanent abstraction.** Review the shared
  contract and diff statistics after milestone 1; prefer deleting forwarders
  and compatibility fixtures over generalizing them.

## Review and commit strategy

The first review gate follows milestone 1 because it changes retained-resource
ownership and the WebGL hot path. Review delegate identity, revision coverage,
shader initialization order, dynamic data, normal/picking reuse, disposal, and
profiler evidence together. Apply correctness and KISS fixes before committing
the milestone.

The final review follows milestone 2 and the integration matrix. Audit every
former shared lifecycle consumer, verify WebGPU directories remain untouched,
inspect the WebGL deletion boundary, compare screenshots and App interactions,
and evaluate WebGL performance evidence. Do not add a separate cleanup commit
for small review fixes.

Before opening a pull request, mark every checklist item completed or
discarded and commit the reconciled plan. Delete this temporary plan in a later
commit; do not merge it.
