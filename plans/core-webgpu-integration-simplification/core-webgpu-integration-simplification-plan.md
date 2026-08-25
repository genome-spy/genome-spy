# Core–WebGPU integration simplification plan

Status: In progress. Milestones 1 through 5 are implemented or reconciled,
verified, and reviewed. Milestone 6 is in progress.

## Context

The interaction-performance project made the WebGPU path substantially more
efficient without requiring a corresponding redesign of
`@genome-spy/webgpu-renderer`. That is good evidence for the renderer's small,
handle-based API and for the retained-frame boundary now used by Core.

The integration itself is nevertheless heavy. Current production JavaScript in
`packages/core/src/rendering/webgpu/` is approximately 4,200 lines, including
about 2,500 lines in `webGpuMarkAdapter.js` and 880 lines in
`webGpuSurface.js`. Its tests add roughly 3,300 lines. Some of this size is
inherent mark translation, but Core also maintains a parallel retained-state
and dependency system:

- module-level `WeakMap`s track mark configuration, expression dependencies,
  scale dependencies, resource revisions, and adapter-specific state;
- the surface reflects over configuration objects, snapshots values, compares
  them, and rediscovers dynamic properties during synchronization;
- Core refers to built-in shader uniforms such as `uViewport` and
  `uHeadSlope`, leaking renderer implementation details across the boundary;
- retained state is divided between adapter maps, frame-plan records, surface
  records, renderer handles, and placement resources;
- the retained frame plan preserves Core's closure-backed `Rectangle` graph so
  live scrolling geometry remains visible without layout replay, even though
  the renderer's public `DrawRect` contract is already plain materialized data;
- Core assembles fresh draw, viewport, scissor, and placement envelopes while
  the renderer allocates another normalized draw representation on each paint;
- several type assertions and tests compensate for contracts that are only
  partially expressed in the renderer's public types;
- a few helpers and compatibility entry points duplicate existing behavior or
  exist only for tests.

The main opportunity is therefore not another rendering architecture. It is to
make the existing boundary explicit, compile synchronization work once, and
delete duplicate bookkeeping. File splitting comes only after that deletion;
moving the same complexity between modules is not a simplification.

## Baseline and measurement

Record the following before the first implementation milestone and after every
milestone that changes production code:

- production and test line counts for Core's WebGPU integration;
- production line counts and public exports for `webgpu-renderer`;
- compressed and uncompressed sizes of existing renderer bundle fixtures;
- the number of Core-owned retained maps, dynamic-property discovery loops,
  configuration snapshot/equality helpers, and raw shader-uniform references;
- allocations or temporary object creation in the dirty-mark synchronization
  path where they can be counted reliably;
- allocation counts and CPU time for Core draw assembly, rectangle
  materialization, and renderer draw normalization; and
- the number of closure-backed rectangle reads per paint in representative
  ordinary, faceted, and closeup frames where instrumentation is practical.

The previous project's hardware-backed DPR 1 interaction benchmark remains the
performance regression gate. Do not restore DPR 2 to the routine matrix: the
measured work is CPU-side and not fill-rate-bound. Preserve the existing MCCA
manual checks for pan, zoom, closeup transition, closeup wheel scrolling,
picking, and resize.

The estimated opportunity is to remove 700–1,000 production lines from the
Core integration, with a smaller `webGpuMarkAdapter.js` of roughly 1,700–1,900
lines after its remaining responsibilities are separated. These are planning
estimates, not reasons to delete readable code or move it uncounted elsewhere.
Each milestone must report the net change across Core and the renderer.

### Recorded Milestone 1 baseline

The pre-change baseline was captured on 2026-08-25. Counts use tracked source
files under the named `src` directories; renderer test lines below exclude the
separate hardware GPU-test directory.

| Measure                           | Baseline | After current Milestone 1 changes |
| --------------------------------- | -------: | --------------------------------: |
| Core WebGPU production JavaScript |    4,199 |                             4,150 |
| Core WebGPU tests                 |    3,288 |                             3,309 |
| Renderer production JavaScript    |   14,711 |                            14,711 |
| Renderer unit tests               |    4,708 |                             4,708 |
| Renderer public type exports      |      109 |                               110 |
| Renderer package export subpaths  |       22 |                                22 |

The single added renderer export is the type-only `ArrowMarkOptions`; the root
runtime API is unchanged. The current Core production reduction is 49 lines.
The 21-line test increase covers the newly explicit dynamic-value contract and
replaces the removed production test convenience with a local helper.

The renderer bundle fixtures were unchanged byte for byte:

| Fixture              | Minified bytes | Gzip bytes | Modules |
| -------------------- | -------------: | ---------: | ------: |
| `rendererOnly`       |         15,593 |      4,930 |       2 |
| `pointLinear`        |        123,195 |     35,521 |      52 |
| `pointOrdinal`       |        125,653 |     36,151 |      55 |
| `customIdentityMark` |         15,740 |      5,010 |       2 |
| `textCustomFont`     |        123,644 |     35,998 |      56 |
| `textLato`           |        224,400 |    106,079 |      59 |

The initial retained-state inventory found six module-level adapter `WeakMap`s;
four surface owner/resource containers; one frame-plan mark map; and one
option-range `WeakMap` per packed mark-data record. Milestone 1 removes the
per-record option-range map. The other containers are candidates for the
revision and retained-binding milestones, not safe seam deletions.

Core currently contains 25 built-in raw-uniform references. These remain the
Milestone 2 baseline. Source inspection also establishes at least two fresh
top-level objects per submitted occurrence before renderer normalization: the
context options and surface draw command. Conditional viewport, scissor,
visible-range, and placement records add more. Renderer normalization then
creates a normalized draw and viewport copy, while rectangle intersections may
create further records. The retained DPR 1 benchmark recorded 5,210
`drawNormalization` samples with a 0.10 ms median, 0.20 ms p95, and 0.133 ms
mean; the wide 4–135,625 normalized-draw range makes source-level allocation
counts more useful than one aggregate object estimate. Milestone 4 must replace
these allocations with stable occurrence-owned records before the optimization
is judged complete.

## Goals

- Preserve the renderer's small handle-and-slot API as the canonical low-level
  contract.
- Remove duplicated change detection and retained-state bookkeeping from Core.
- Replace built-in raw uniform names in Core with semantic renderer properties.
- Express invalidation through explicit Core-owned revisions rather than an
  adapter-specific dependency graph.
- Make renderer-facing viewport, scissor, and culling geometry explicitly
  materialized data with stable reusable storage.
- Establish an incremental path for removing Core's closure-backed rectangles
  without turning the renderer into their replacement scene graph.
- Compile stable synchronization operations once per mark/configuration shape
  and perform work only for dirty marks.
- Improve public types and seam tests so the integration needs fewer casts,
  implicit assumptions, and implementation-shaped fixtures.
- Reduce source size, hot-path allocation, and conceptual surface area without
  compromising the retained-frame performance gains.
- Keep `webgpu-renderer` modular, extensible, and tree-shakeable.

## Non-goals

- Replacing stable slots with a required `update(patch)` API.
- Replacing `DrawRect` with a callback, observable rectangle, or renderer-owned
  geometry node.
- Adding a scene graph, view hierarchy, grammar, or App-specific interaction
  behavior to `webgpu-renderer`.
- Turning `ViewRenderingContext` into a retained renderer object or a WebGPU
  state container. It may gain only small backend-neutral contracts that are
  also meaningful to other renderers.
- Moving Core mark translation wholesale into the renderer.
- Introducing SampleView or facet semantics into the generic renderer;
  placement remains the generic use case used by facets and closeup scrolling.
- Avoiding full placement-buffer updates without measurement showing that they
  matter.
- Reimplementing the completed retained-frame optimization or changing its draw
  ordering, visible/picking plan sharing, and dirty-mark behavior.
- Splitting large files before responsibilities and duplicate paths have been
  removed.
- Preserving obsolete internal test helpers as compatibility APIs.
- Removing every closure-backed Core `Rectangle` in this project. This project
  isolates them from the renderer boundary and provides the revisions needed
  for their later incremental replacement.

## Prerequisites

- The completed retained-frame commits and their explanatory comments remain
  the starting point; do not rebase the design on the earlier replay path.
- The corrected benchmark input coverage and DPR 1 hardware-backed runner are
  available as the regression gate.
- Milestone 1 captures exact source and bundle baselines before implementation
  changes, including the current 4,199 production Core integration lines.
- Any work under `packages/core` or `packages/webgpu-renderer` follows its local
  `AGENTS.md` and package-specific test commands.

## Architectural invariants

The following properties were responsible for the interaction-performance
improvement and must not be refactored away:

- settled layout is compiled once into a retained frame plan;
- visible and picking passes share that plan and maintain established draw
  order;
- steady-state paints synchronize only dirty marks and do not replay layout;
- scrolling, sticky axes, closeup transitions, clipping, and culling continue
  to observe live geometry after `onBeforeRender()`;
- `PlacementSource` remains renderer-neutral and supports complete geometry
  updates, CPU placement culling, and indexed upload coalescing;
- selection invalidation stays conservative until every selection producer has
  an explicit revision contract;
- renderer resources remain owned through explicit handles and lifetimes;
- Core and App semantics do not leak into `webgpu-renderer`.

Comments and tests that protect these invariants are part of the implementation,
not optional cleanup.

## Key decisions

### Keep slots; make built-in slots semantic

The renderer's stable slots are useful for introspection and permit allocation-
free updates on hot paths. They remain the canonical update mechanism. Core
should no longer populate an open-ended `dynamicValues` object using WGSL
uniform names for renderer-provided marks. Built-in programs instead expose
typed semantic properties or slots such as viewport and arrow-head angle. Raw
extra uniforms remain available only as an advanced bridge for custom shaders.

An ergonomic `update(patch)` method may be considered later, but only as a thin
optional convenience over slots. It is not needed for this refactoring and must
not create a second state or synchronization model.

### Use explicit revisions at the owner

Core already owns marks, expressions, scales, packed data, selection state, and
resource lifetimes. Each mutable category needed by a backend should expose an
explicit monotonic revision or equivalent invalidation signal at that owner.
Existing watchers should advance these signals; the WebGPU adapter should not
reconstruct the same dependency graph in module-level maps.

The initial revision taxonomy is deliberately small: configuration/expression,
scale, packed data, resource, draw geometry, placement, and selection. Draw
geometry covers materialized viewport, scissor, and culling records; placement
covers dense repeated-panel geometry and topology. Combine categories when they
always invalidate the same compiled work. Add a category only when a benchmark
or correctness case needs a distinct action.

### Materialize renderer-facing geometry once

`webgpu-renderer` continues to accept plain structural `DrawRect` values. It
must never receive or evaluate Core `Rectangle` accessors. Each retained Core
occurrence owns stable materialized viewport, scissor, visible-range, placement,
and draw-command records. Allocate these records when compiling the frame plan,
then update their numeric fields in place after `onBeforeRender()` when the
owning draw-geometry or placement revision changes.

Materializing only at frame-plan compilation would freeze scrolling and
closeup geometry and is therefore incorrect. Allocating a fresh object on every
paint would preserve behavior but worsen garbage collection. Until every live
rectangle producer exposes a complete revision, conservatively refresh the
affected reusable records on each paint and record that fallback. The fallback
must allocate nothing and must disappear producer by producer as revisions
become authoritative.

Core's closure-backed rectangles may remain temporary geometry sources inside
the frame plan during migration, but no such object crosses into
`WebGpuSurface` or the renderer. This isolates the renderer API from the old
model and creates a stable seam for eventually replacing the sources with
materialized Core layout values.

The renderer reads each `RenderFrame` synchronously as a value snapshot. A
caller may retain and mutate its plain draw records before a later render call,
but the renderer must not keep those caller-owned objects and observe later
mutation implicitly. Normalization, caching for on-demand picking, and other
retained representations remain renderer-owned. This permits allocation-free
caller reuse without establishing shared mutable scene state across the API.

### Compile synchronization once

For each retained mark, compile a stable list of updater records from semantic
Core values to renderer slots. A record may hold a reader, target slot, and the
minimal snapshot or revision needed for its value semantics. Normal paints walk
that list only when the owning mark revision says it may have changed.

Do not build per-frame patch objects. Do not enumerate arbitrary configuration
objects or rediscover slots on every paint. Typed arrays and other mutable
values still require an explicit revision or a narrowly defined snapshot rule;
object identity alone is not a universal change detector.

### Prove the owner of reusable synchronization

A small compiled synchronizer may belong in an optional renderer subpath if it
is completely generic to renderer handles and measurably deletes more code than
it adds. It must be excluded from bundles that do not import it. If the helper
needs Core concepts, mark types, scale semantics, or view state, it belongs in
Core instead.

This is a milestone review decision, not a predetermined renderer API addition.
The default is to keep the public root API unchanged.

### Simplify before modularizing

After the state and synchronization model is smaller, divide the remaining
adapter by stable responsibility: data packing and occurrence ranges,
channel/scale translation, and mark configuration. A split is accepted only if
the dependencies between those modules are narrower than the current internal
dependencies and total production size does not grow materially.

## Comparable patterns considered

- Three.js [`BufferAttribute`](https://threejs.org/docs/#api/en/core/BufferAttribute)
  exposes `needsUpdate` and a monotonic `version`. This supports owner-provided
  revision signals rather than a renderer adapter inferring mutation by
  traversing state.
- regl's [command API](https://github.com/regl-project/regl/blob/master/API.md)
  compiles stable GPU work while allowing explicitly dynamic values. This
  supports compiling the binding shape once and evaluating only declared
  dynamic inputs during a draw.

Both projects are MIT-licensed. This plan borrows only architectural lessons;
no source adaptation is anticipated. GenomeSpy retains explicit resource
handles and does not adopt either project's scene or command model.

## Expected affected areas

| Area                             | Intended change                                              | Explicit boundary                      |
| -------------------------------- | ------------------------------------------------------------ | -------------------------------------- |
| Core marks and mutable resources | Backend-neutral revisions                                    | No WebGPU imports or callbacks         |
| `ViewRenderingContext`           | At most a small shared invalidation contract                 | No retained GPU state                  |
| Core layout geometry             | Explicit draw-geometry revisions and snapshots               | Closure sources stay transitional      |
| Core WebGPU adapter              | Delete dependency maps and compile bindings                  | Remains the grammar translator         |
| Core WebGPU surface              | Consume materialized stable draws and delete duplicate state | No Core `Rectangle` inputs             |
| `webgpu-renderer` handles        | Semantic built-in slots and complete types                   | Slots remain canonical                 |
| Renderer draw path               | Reuse normalization storage if measurement justifies it      | No retained scene graph API by default |
| Renderer package exports         | Optional helper only if proven smaller                       | Root API stays small by default        |
| WebGL and Canvas2D coordinators  | Optional shared settled-layout traversal                     | Backend lifecycles stay explicit       |
| Core and renderer documentation  | Final ownership and migration notes                          | No App-specific concepts               |

## Milestone 1: Harden the seam and harvest safe deletions

### Intended outcome

Remove known duplicate and test-only paths, make current contracts testable,
and establish a trustworthy size baseline before changing ownership.

### Work

- Capture the measurements listed in the baseline section in a committed or
  reproducible report.
- Complete public renderer types for Core-used mark options, including text
  viewport/logo-letter options and arrow option composition.
- Add focused type fixtures and seam tests for the actual Core-to-renderer
  configurations. Prefer representative contracts over snapshots of whole
  implementation objects.
- Make the rectangle seam explicit in types and tests: the renderer accepts
  materialized numeric `DrawRect` snapshots and has no contract for accessors,
  lazy values, Core rectangles, or later observation of object mutation.
- Instrument current Core draw assembly and renderer normalization sufficiently
  to distinguish closure reads, plain-object allocation, and normalization CPU
  time in representative frames.
- Make `liveValue()` explicitly mark a value dynamic and delete recursive
  retainability rewriting where this makes it redundant.
- Reuse the existing encoder construction path for conditional branches and
  delete `createBranchEncoder()` if behavior remains identical.
- Remove production `WebGpuSurface.useMark()` if it is only a test convenience;
  test through retained-frame or focused internal seams instead.
- Replace `toDrawRect()` only when retained occurrences own materialized draw
  rectangles directly. Do not pass a structurally compatible Core `Rectangle`
  through the surface merely to delete this small conversion helper.
- Resolve occurrence option ranges when packed data changes rather than caching
  them by draw-options identity on every draw.
- Move renderer-neutral mark-data/property helpers out of immediate-rendering
  modules when doing so removes a misleading dependency without adding a new
  abstraction layer.
- Investigate `noFadingOnPointSelection`: either wire its intended renderer
  behavior with a contract test or remove the unused forwarding path and record
  the parity decision.

### Progress and decisions

- Completed in `f1703fda2`: explicit dynamic values made recursive
  retainability rewriting redundant; the production-only `useMark()` test
  convenience and packed-data option-range cache were removed; occurrence
  ranges now update only when packed-data identity changes.
- Completed in `9ad010a9f`: public text and arrow option types now cover Core's
  actual configurations, with representative type fixtures and no runtime or
  bundle change.
- Discarded reuse of Core's ordinary encoder construction for conditional
  branches. A trial caused 27 adapter-test failures because that path applies
  Core scales, whereas WebGPU intentionally passes raw accessor values and
  delegates scaling to the renderer. Keeping the small branch encoder preserves
  that semantic boundary more clearly than parameterizing the shared helper.
- Removed the dead Core forwarding of `noFadingOnPointSelection`. The renderer
  behavior remains an explicit parity item in its migration backlog; inventing
  an unmeasured contract in this cleanup would conflate parity work with seam
  simplification.
- Deferred `toDrawRect()` removal to Milestone 4, where occurrences gain stable
  materialized renderer geometry. Passing Core rectangles through the surface
  now would obscure rather than improve the boundary.
- Discarded moving renderer-neutral data/property helpers merely to change
  their module location. Reconsider a move only when a later deletion leaves a
  cohesive reusable responsibility.
- No allocation instrumentation was added to production hot paths. The existing
  benchmark timing plus the reproducible source-level allocation inventory above
  gives the required baseline without adding temporary machinery that would
  itself need removal.

### Verification

- Focused Core WebGPU and renderer unit suites.
- Renderer TypeScript check and the new type fixtures.
- Before/after source, test, export, and bundle-size report.
- Baseline draw-assembly, rectangle-read, and normalization allocation counts.
- One hardware-backed smoke run to confirm visible and picking passes.

### Tentative commits

- `refactor(webgpu): remove redundant Core adapter paths`
- `fix(webgpu-renderer): complete Core integration types`

### Review gate

Confirm that the milestone has a net simplification. Revert or defer helpers
that merely relocate code. Confirm that no public renderer root export was
added accidentally.

Milestone 1 is complete. The focused suites, type checks, bundle fixtures, and
the renderer's 52-test hardware-backed GPU suite pass. The final KISS audit
retained only changes with an explicit deletion or contract benefit.

## Milestone 2: Introduce semantic built-in property slots

### Intended outcome

Core configures renderer-provided marks without knowing WGSL uniform names,
while custom shader integrations retain an explicit low-level escape hatch.

### Work

- Inventory every raw uniform key emitted by Core and classify it as a built-in
  semantic property or a custom-shader extra value.
- Define typed semantic slots/properties on the relevant renderer mark handles.
  Preserve stable slot identity and direct `set()` operations.
- Move renderer-specific conversions, such as arrow angle to shader slope, to
  the renderer definition that owns the shader representation.
- Centralize enum/string codecs in the renderer when they describe renderer
  semantics; remove matching Core maps.
- Restrict `extraValues`/raw dynamic values to custom programs and document that
  boundary without exposing WGSL details in the main quick-start API.
- Migrate Core built-in mark configuration and update seam tests.
- Check whether semantic slot definitions can replace configuration reflection
  in the surface; do not implement the complete synchronization rewrite yet.

### Progress and decisions

- Added typed, stable `handle.properties` slots for updateable text, link, and
  arrow options. Initial configuration and later updates share the same
  renderer-owned descriptors, so semantic conversion has one implementation.
- Moved arrow degree-to-slope conversion and link/arrow enum codecs into the
  programs that own their shader representation. Core passes degree angles,
  strings, Booleans, and numeric values without naming uniforms or renderer
  codes.
- Kept `extraValues` as the raw custom-program escape hatch and added the
  type-only `ExtraValueMarkOptions` mixin for custom configs. Built-in
  `MarkConfig` no longer advertises raw dynamic uniforms.
- Kept the descriptor compiler in its own internal module imported only by
  text, link, and arrow. Point, rect, rule, and custom definitions do not bundle
  it.
- Separated Core's live semantic-property readers from the renderer config.
  `WebGpuSurface` synchronizes them through `handle.properties` and fails loudly
  if the renderer lacks a declared slot.
- Luna's required API review found three follow-ups: duplicate Core enum
  vocabularies, lost numeric boundary validation, and disconnected custom-extra
  typing. All three were fixed before commit; no architectural re-review was
  needed.

### Milestone 2 measurements

| Measure                           | Original baseline | After Milestone 2 | Delta |
| --------------------------------- | ----------------: | ----------------: | ----: |
| Core WebGPU production JavaScript |             4,199 |             4,100 |   -99 |
| Core WebGPU tests                 |             3,288 |             3,317 |   +29 |
| Renderer production JavaScript    |            14,711 |            14,886 |  +175 |
| Renderer unit tests               |             4,708 |             4,820 |  +112 |
| Renderer public type exports      |               109 |               116 |    +7 |
| Renderer package export subpaths  |                22 |                22 |     0 |

The cross-package production total is temporarily 76 lines above the original
baseline. This is accepted at the public API boundary because it removes
stringly shader coupling and enables the larger reflection/revision deletions
in Milestones 3–4. It must be repaid there rather than counted as a completed
simplification.

Bundle growth stays localized and small: renderer-only is +24 minified/+9 gzip;
point fixtures are +38/+14–15; custom identity is +24/+5; and text fixtures are
+414/+208–224 with one property-helper module. No export subpath or unrelated
mark/scale/font module was pulled into a fixture.

### Verification

- No built-in WGSL uniform names remain under Core's WebGPU integration.
- All renderer mark and slot tests pass, including introspection and repeated
  allocation-free `set()` calls.
- Custom-program extra values remain tree-shakeable and separately tested.
- Existing bundle fixtures do not grow materially; explain any type-only or
  unavoidable runtime delta.

### Tentative commits

- `feat(webgpu-renderer): expose semantic built-in slots`
- `refactor(webgpu): use semantic renderer properties`

### Review gate

Review the public API before proceeding. Confirm that it remains small, that
slots are canonical, and that Core-specific vocabulary has not entered the
renderer.

Milestone 2 is complete. Core contains no built-in raw-uniform reference. Luna
confirmed stable slot-map identity, the custom-program boundary, and the
tree-shaking result after the review fixes.

## Milestone 3: Add backend-neutral Core revisions

### Intended outcome

Core tells render backends what category changed. The WebGPU adapter no longer
maintains a parallel graph of expression, scale, resource, and selection
dependencies.

### Work

- Trace current watcher and invalidation ownership for expressions, scales,
  packed data, draw geometry, placement, and selections. Include live rectangle
  producers used by scrolling, sticky axes, closeup transitions, clipping, and
  culling.
- Add the smallest backend-neutral revision contract to Core marks and the
  actual owners of mutable resources.
- Make existing update paths advance revisions exactly once for a logical
  change. Avoid backend callbacks and WebGPU imports in general Core classes.
- Consume revisions in the current retained WebGPU plan while keeping the old
  fine-grained synchronization temporarily available for comparison.
- Add transition tests for clean-to-dirty-to-clean behavior and for multiple
  mutations before one paint.
- Preserve conservative selection invalidation where the producer cannot yet
  provide a complete revision. Record each remaining conservative path.
- Publish a backend-neutral draw-geometry revision from the smallest existing
  owner that knows viewport, clip, or culling geometry changed. Do not make
  renderers observe Core rectangle accessors.
- Record closure-backed geometry producers that cannot yet publish a complete
  revision; their temporary fallback is allocation-free refresh, not stale
  snapshots.
- Delete adapter-owned dependency maps and watchers as their owner-provided
  replacements become authoritative.

### Progress and decisions

- Core marks now expose lazy `configuration` and `resources` revisions.
  Expression-backed data columns advance configuration because their packed
  values must be rebuilt. Expression-backed channel values, retained mark
  properties, and scale notifications advance resources because their stable
  bindings can be synchronized in place.
- Revision tracking is opt-in and begins only when a retained renderer asks for
  it. This avoids duplicating WebGL's existing listeners and per-mark state.
  Retained property dependencies are registered next to the adapter code that
  creates their live values instead of through a second discovery pass.
- The adapter-owned dynamic-property, dynamic-encoding, and resource-revision
  `WeakMap`s and their watcher functions have been deleted. Collector data and
  placement continue to use their existing owner-provided revisions.
- Selection resources remain conservatively volatile because `ParamRuntime`
  does not yet expose a complete selection revision. This state is currently
  attached to the mark by the WebGPU translation and is a documented
  transitional bridge, not the final selection-owner contract.
- The mark-level expression dependency bridge is likewise transitional: it
  moves subscription lifetime and revision state to the mark, but expression
  mutation is still observed through `ParamRuntime.watchExpression()`. Do not
  describe Milestone 3 as complete until geometry ownership and the remaining
  conservative paths have been reconciled.
- Geometry tracing confirmed that explicit sample placement already has a
  complete owner revision in `PlacementSource`. Closure-backed scrollbar,
  sticky-summary, clip, and culling rectangles do not yet share a complete
  mutation signal. A synthetic per-frame geometry revision was rejected
  because it would merely mirror renderer work; Milestone 4 instead uses the
  documented allocation-free materialization fallback for those producers.
- A Luna review rejected the first eager implementation because it duplicated
  listeners for WebGL and classified every expression property as a live
  resource. The accepted implementation is lazy and registers only properties
  with an actual retained value or semantic slot.
- Current counts are 3,960 Core WebGPU production lines and 3,308 Core WebGPU
  test lines. Relative to the Milestone 2 result, the integration directory is
  down 140 production lines and 9 test lines; including the backend-neutral
  mark revision code, affected production is down 18 lines overall.

### Verification

- WASD pan/zoom, closeup toggle, and closeup wheel remain layout-free.
- Expression, scale, data, resource, draw-geometry, placement, and selection
  changes each trigger the required update and no unrelated recompilation.
- Scrollbars, sticky axes, closeup transitions, clipping, and culling update
  materialized geometry at the same point in the frame as their current live
  rectangles.
- Visible and picking frames observe the same logical revision state.
- Core WebGL behavior and tests remain unchanged or consume only genuinely
  backend-neutral contracts.
- Counts show a net decrease in retained maps and watcher registrations.

### Tentative commits

- `refactor(core): expose mark rendering revisions`
- `refactor(webgpu): consume owner-provided revisions`

### Review gate

Review the revision taxonomy before removing compatibility paths. Confirm that
draw geometry and placement have genuinely different update actions, merge
categories that do the same work, and reject revisions whose only purpose is to
mirror a WebGPU implementation detail.

## Milestone 4: Compile one retained binding per mark

### Intended outcome

Each Core mark has one WebGPU-owned binding that compiles semantic slot updates
once and owns the adapter's retained synchronization state.

### Work

- Define a single retained binding record for a Core mark, including renderer
  handle, compiled updater records, observed revisions, packed occurrence data,
  and resources whose lifetime belongs to that binding.
- Give each occurrence inside the binding one stable materialized draw command
  and reusable viewport, scissor, visible-range, and placement records. Preserve
  object identity across ordinary visible frames and picking frames.
- Refresh materialized geometry in place after `onBeforeRender()` and before
  culling or submission. Use the draw-geometry revision where complete and the
  documented allocation-free fallback for remaining closure-backed producers.
- Move culling and localization to the materialized snapshots so each source
  rectangle is evaluated at most once per refresh rather than through repeated
  accessor chains.
- Compile updater records when configuration shape changes. Normal paints use
  revisions to select records and call stable slots directly.
- Consolidate the remaining adapter `WeakMap`s, frame mark state, and surface
  retained records into that binding where their lifetimes match.
- Delete surface-side arbitrary-object traversal, general configuration
  snapshots/equality, and dynamic-property rediscovery made redundant by the
  compiled records.
- Delete per-paint draw-option spreads, viewport copies, and nested placement
  envelopes from the Core path. `WebGpuSurface` receives renderer-shaped plain
  data and never accepts a Core `Rectangle`.
- Keep typed-array mutation semantics explicit. Never skip a required upload
  because a mutable value retained its identity.
- Prototype the binding compiler in Core. Move only a generic handle/slot
  synchronizer to an optional renderer subpath if measured total code and
  bundle results satisfy the ownership decision above.
- Keep direct slot use public even if an optional helper is accepted.

### Progress and decisions

- Each occurrence now owns one stable renderer-shaped draw command plus stable
  viewport, scissor, visible-range, and placement envelopes. Normal and picking
  submissions reuse their identity instead of rebuilding nested option objects.
- Closure-backed geometry is evaluated after `onBeforeRender()` and written
  into those records in place. Generated ordinary-occurrence placement uses a
  reusable `Float32Array`; explicit placement continues to rely on
  `PlacementSource.geometryRevision`.
- `WebGpuSurface` now attaches retained mark and placement handles directly to
  the materialized command. The deleted path allocated a surface draw object,
  viewport copy, and nested placement envelope for every submitted occurrence.
- This is the geometry/draw-record slice of the milestone. Mark bindings,
  compiled updater records, and deletion of reflected configuration snapshots
  remain. The slice adds 27 Core WebGPU production lines relative to the first
  Milestone 3 commits, accepted because it removes steady-state allocations and
  fixes refresh of generated closure-backed placement geometry. The cumulative
  integration directory remains 113 production lines below Milestone 2.
- A Luna review accepted the draw lifetime, refresh timing, materialized
  rectangle boundary, and visible/picking identity reuse. Placeholder renderer
  handle identifiers remain an explicitly documented internal compromise until
  the binding slice owns the complete renderer-facing record.
- The surface's retained-mark record now is the renderer-resource binding. It
  compiles scale, value, semantic-property, and scalar leaves into a flat list
  of direct slot updates only when configuration identity changes. Stable dirty
  frames no longer traverse channel trees or rediscover dynamic properties.
  Semantic keys carry immutable snapshots across rare recompilations.
- Selection synchronization stays separate because single, multi, and interval
  selections have distinct comparison and snapshot semantics. A trial folding
  them into the generic compiler increased production size and was discarded.
- Layout-local packed ranges and occurrence records remain in the frame plan;
  renderer handles and owner-lifetime resources remain on the surface. Merging
  those records was rejected because their replacement and disposal lifetimes
  differ. The adapter's three `WeakMap`s remain narrowly scoped data/column
  caches rather than duplicate retained renderer state.
- The compiled-binding slice removes 17 Core WebGPU production lines. Together
  with stable materialized draws, the integration is 130 lines below the
  Milestone 2 baseline and only 10 lines above the first Milestone 3 commits.
- Luna's final review found no blockers and accepted semantic-key snapshot
  carryover, the reflection-free stable dirty path, array mutation handling,
  the geometry refresh, and the separate ownership of selections and adapter
  caches. Milestone 4 is complete. The binding compiler continues to rely on
  the existing contract that one renderer definition has a stable semantic
  slot shape; a code TODO guards any future relaxation of that contract.

### Verification

- Steady-state clean frames perform no mark configuration traversal and create
  no patch/update, draw-command, or rectangle objects.
- Dirty frames touch only marks and updater groups selected by revisions.
- Renderer-facing rectangle and draw-command identity remains stable across
  repeated frames while numeric fields reflect current scrolling and closeup
  geometry.
- No Core `Rectangle` or rectangle accessor reaches `WebGpuSurface` or
  `webgpu-renderer`.
- Renderer handles and GPU resources are released exactly once on rebuild and
  teardown.
- The DPR 1 interaction benchmark preserves the completed plan's structural
  counters and does not regress materially within its established noise model.
- MCCA manual profiling confirms that synchronization remains efficient.
- Total Core-plus-renderer production size falls; any optional renderer helper
  is absent from a fixture that does not import it.
- The focused 78-test Core WebGPU suite, the full 3,526-test repository suite,
  Core type checking, and focused linting pass. Hardware-backed smoke checks
  cover six examples on both backends plus MCCA WebGPU rendering and picking.
- Short DPR 1 MCCA runs cover horizontal WASD, WASD zoom, closeup toggle, and
  closeup wheel. All correctness checks pass, and the layout and layout-replay
  counters remain zero as required.

### Tentative commits

- `refactor(webgpu): compile retained mark bindings`
- `refactor(webgpu): remove reflected config synchronization`

### Review gate

Confirm ownership and tree shaking before proceeding. If the generic renderer
helper fails the size or dependency test, keep the binding compiler in Core and
remove the prototype from the renderer.

## Milestone 5: Reconcile coordinators and draw preparation

### Intended outcome

Remove residual duplicated orchestration without weakening backend boundaries
or creating a generic framework larger than the code it replaces.

### Work

- Compare the settled-layout loops in WebGL, WebGPU, and Canvas2D coordinators.
  Extract a backend-neutral iterator only if it deletes meaningful duplication
  and makes lifecycle order clearer.
- Evaluate a prepared encoder/branch plan now that retained bindings expose
  stable data and property revisions. Compile only demonstrably stable branch
  structure; do not create a second command graph.
- Reprofile renderer `_normalizeDraws()` with stable materialized Core commands.
  If allocation or CPU time remains meaningful, reuse separate normal and
  picking normalization storage internally. Keep the public iterable
  `DrawCommand` API unless a smaller API change is proven necessary.
- Do not add public retained draw handles merely to avoid internal scratch
  allocation. Such handles are acceptable only if they replace more machinery
  than they add and do not become a renderer scene graph.
- Remove obsolete immediate-rendering responsibilities and imports revealed by
  the retained binding model.
- Reassess complete placement updates using the benchmark counters. Keep them
  unchanged unless they have become a measured bottleneck.

### Progress and decisions

- A shared settled-layout helper was prototyped across WebGL, WebGPU, and
  Canvas2D, including the common five-pass limit. It removed only 8 production
  lines while adding a module, callback indirection, and 25 test lines. The
  prototype was discarded; the short backend-local loops remain clearer.
- The hardware-backed stable-draw MCCA artifact reports draw normalization at
  approximately 0.15 ms on average across 459 phase samples, compared with
  approximately 0.27 ms for command encoding and 0.55 ms for the complete
  surface render. Reusable normal/picking normalization storage was discarded
  because the small measured cost does not justify mutable parallel snapshots
  or a retained-draw API.
- A prepared encoder/branch plan was discarded. Configuration translation is
  already selected by packed-data and expression revisions, while dirty live
  resources now use compiled slot bindings. A second branch graph would target
  rare configuration misses and duplicate the adapter's existing structure.
- The remaining imports from `rendering/immediate` are shared Core data and
  property helpers, not immediate-renderer orchestration. Moving or wrapping
  them would reorganize names without deleting responsibility. The WebGL
  `isLargeGenome()` import is a placement issue for Milestone 6, not hot-path
  work.
- Complete placement uploads remain unchanged. Prior benchmark counters and
  manual profiling identify them as a minor cost: the stable-draw artifact
  recorded 121 uploads totaling 1,142,240 bytes. The generated-placement
  equality scan has no evidence warranting another optimization path.
- Luna's review found no blockers and agreed that none of the evaluated changes
  clears the milestone's deletion and complexity thresholds. Milestone 5 is
  complete with all proposed implementation paths deliberately discarded.

### Verification

- Backend coordinator lifecycle and error-order tests.
- Conditional encoder and branch parity tests.
- Stable draw reuse, current-geometry, and independent visible/picking snapshot
  tests if normalization storage is reused.
- Focused WebGL, Canvas2D, and WebGPU tests for any shared helper.
- Net production-code reduction across all affected backends.

### Tentative commits

- `refactor(core): share settled-layout traversal`
- `refactor(webgpu): prepare stable draws and encoder branches`

### Review gate

Either change may be discarded independently. Keep straightforward duplication
when the proposed shared mechanism is larger or obscures backend lifecycle.

## Milestone 6: Modularize the residual adapter and integrate

### Intended outcome

The remaining code is organized around stable responsibilities, documented,
measured, and ready for the temporary plan to be retired.

### Work

- Split the residual adapter only where the simplified dependency graph gives
  modules cohesive ownership: packing/occurrences, channel/scale translation,
  and mark configuration.
- Keep orchestration and binding lifetime in a small entry module. Avoid barrel
  exports that pull all mark implementations into partial consumers.
- Update Core's WebGPU integration README with the revision and binding model,
  materialized renderer-geometry boundary, transitional closure-source
  ownership, and performance invariants.
- Update renderer README/API and migration notes only for public contracts that
  actually changed.
- Record final Core, renderer, test, export, bundle, allocation, and benchmark
  comparisons against the baseline.
- Reconcile every incomplete item as complete or discarded with rationale.
- Commit the reconciled plan, then delete it in a later integration commit as
  required by the repository workflow.

### Progress and decisions

- Collector/topology packing and occurrence-range lookup moved to
  `webGpuMarkData.js`. It depends only on renderer-neutral Core mark data and
  placement snapshots; the frame plan is its sole production consumer.
- The extraction reduced `webGpuMarkAdapter.js` from 2,325 to 2,210 lines while
  adding a 116-line module. A one-line import reduction keeps total Core WebGPU
  production size unchanged at 3,970 lines. The dedicated tests add five net
  lines. This is accepted as a cohesive ownership improvement rather than a
  footprint reduction.
- Placement-index packing remains with configuration translation because its
  validation uses encoder and mark-context error semantics. Moving it would
  introduce a callback or reverse dependency into the data module.
- Index/locus precision predicates now live in
  `scales/indexLikeDomainUtils.js`. WebGPU no longer imports the GLSL generator,
  and Core marks reuse the existing backend-neutral index-like type predicate
  instead of a duplicate `isHighPrecisionScale()`. The move removes five net
  Core production lines.

### Verification

- Focused Core WebGPU and renderer suites.
- Workspace TypeScript checks and lint for affected packages.
- Renderer tree-shaking/bundle fixtures.
- Hardware-backed DPR 1 benchmark and manual MCCA smoke profile.
- Visible/picking correctness, resize, resource teardown, facets through
  placement, closeup transition, and vertical closeup scrolling.
- Sticky axes, directional clipping, and culling with geometry changes that do
  not initiate a new layout traversal.

### Tentative commits

- `refactor(webgpu): modularize mark translation`
- `docs(webgpu): explain retained integration contracts`
- `chore(webgpu): reconcile integration simplification plan`
- `chore(webgpu): retire integration simplification plan`

### Final review gate

Accept the project only if it produces a material net reduction in Core
integration size and concepts while preserving performance and API discipline.
Do not count code moved to the renderer or general Core modules as deleted.
Document justified misses against the 700–1,000-line estimate rather than
forcing abstractions or unsafe deletion to hit it.

## Milestone dependency and delegation map

- Milestone 1 is independent groundwork and can be delegated as a bounded seam
  cleanup after the baseline is captured.
- Milestone 2 owns renderer semantic API work and can proceed independently of
  most revision work after Milestone 1's type fixtures exist.
- Milestone 3 owns Core revision semantics and can proceed in parallel with
  Milestone 2 after its taxonomy review.
- Milestone 4 depends on both Milestones 2 and 3 and is the central integration
  milestone; keep one owner responsible for the final binding model.
- Milestone 5 contains two optional, independently reviewable simplifications.
- Milestone 6 follows all accepted milestones and should not be parallelized
  across overlapping adapter files.

## Independent Luna review schedule

Use Luna at architectural risk boundaries rather than after every milestone.
Complete and verify the milestone first, then ask Luna to inspect the actual
diff, affected downstream consumers, measurements, and relevant plan decisions.
Apply worthwhile correctness and KISS fixes before the milestone is considered
settled. Re-review only if a fix materially changes the architecture or public
contract.

- **Milestone 1:** Optional brief size and KISS audit. Request it if the cleanup
  adds a new abstraction, misses the expected net reduction, or leaves disputed
  compatibility paths. Otherwise the normal implementation review is enough.
- **Milestone 2:** Required API review. Check every renderer export and Core
  consumer, semantic slot naming and typing, custom-program escape hatches,
  direct slot introspection, materialized `DrawRect` semantics, hot-path
  allocation, and tree shaking.
- **Milestone 3:** Conditional architecture review. Request it when the revision
  taxonomy or ownership is nontrivial, touches shared Core rendering contracts,
  or leaves conservative invalidation beyond the documented selection and
  draw-geometry cases.
  It may be combined with the Milestone 4 review when the revision change is
  small and cannot be evaluated meaningfully before bindings consume it.
- **Milestone 4:** Required architecture and performance review. Check that the
  compiled binding replaces rather than layers over old state, that resources
  have one owner, that mutable values cannot go stale, and that clean and dirty
  hot paths retain the measured performance properties. Verify stable
  materialized draw identity, live geometry correctness, and absence of
  rectangle/draw-command allocation on ordinary paints.
- **Milestone 5:** Conditional review only for an implemented optional change.
  Review coordinator sharing and prepared encoding independently; a discarded
  experiment needs only its recorded rationale and measurements.
- **Milestone 6:** Required final integration review. Check combined Core and
  renderer size, modularity, maintainability, public API footprint, tree
  shaking, resource lifetime, all renderer consumers, and representative MCCA
  interactions before reconciling the plan.

The minimum expected independent reviews are therefore after Milestones 2, 4,
and 6. Milestone 3 receives its own review when its revision model carries
enough independent risk; Milestones 1 and 5 do not create automatic review
overhead.

## Alternatives considered

### Replace slots with `update(patch)`

Rejected for this project. A patch object is pleasant at a call site but loses
some direct introspection and may allocate on the hottest paths. Supporting
patches and slots as peers would add surface area and two update idioms. A later
thin convenience wrapper remains possible if real clients need it.

### Put all synchronization in `webgpu-renderer`

Rejected as a default. The renderer should not learn Core revisions, scales,
expressions, selections, or view lifecycles. Only a demonstrably generic,
tree-shakeable slot synchronizer may cross this boundary.

### Keep Core's general reflected diff engine

Rejected. It is flexible but repeats discovery and comparison work after Core
already knows what changed. Explicit revisions plus compiled updater records
are smaller and make mutation semantics reviewable.

### Add a renderer scene graph or retained draw hierarchy

Rejected. Core already owns the view hierarchy and retained frame plan. A
second hierarchy would increase lifetime and invalidation complexity.

### Materialize fresh rectangles on every paint

Rejected. It would sever the closure graph but exchange accessor evaluation for
predictable garbage proportional to draw count. Retained occurrences instead
own materialized records and update their numeric fields in place.

### Add public retained draw handles

Rejected as a default. Stable Core `DrawCommand` objects already provide a
simple materialized input contract. First reuse Core records and, if justified,
renderer-internal normalization storage. A public handle is warranted only if
measurement shows that it deletes more lifecycle and validation machinery than
it introduces.

### Split `webGpuMarkAdapter.js` immediately

Rejected. It would improve navigation superficially while preserving the
parallel dependency graph and cross-module state. Split only after deletion and
ownership changes expose stable seams.

## Migration and documentation strategy

Treat semantic slots as a renderer API migration only for callers that use raw
uniform names with built-in marks. Keep raw extra values for custom shader
programs, but do not maintain duplicate raw and semantic paths for built-ins
after Core has migrated. If another in-repository caller exists, migrate it in
the same milestone; external compatibility requires an explicit deprecation
decision at the Milestone 2 review gate.

Backend-neutral revisions are internal Core contracts and should not change the
declarative grammar or `ViewRenderingContext` call sequence. Document only the
small contract needed by renderer implementations. The Core WebGPU README owns
the retained binding, geometry materialization, and invalidation explanation;
the renderer README owns public slots, materialized draw semantics, and
custom-program escape hatches. Keep detailed transition notes in the renderer
migration plan rather than expanding the primary README.

Closure-backed `Rectangle` remains a transitional Core implementation detail.
Do not expose a compatibility type or adapter in `webgpu-renderer`. As Core
producers gain explicit geometry revisions and materialized layout values,
remove their fallback refresh and source reference independently; the stable
renderer-facing draw records do not change during that migration.

## Risks and mitigations

- **Missed mutable updates:** identity does not reveal typed-array mutation.
  Require revisions or narrow snapshots for mutable values and test in-place
  updates.
- **Stale materialized geometry:** snapshotting only during frame-plan
  compilation would break live scrolling and clipping. Refresh after
  `onBeforeRender()` using explicit revisions, with an allocation-free fallback
  until each producer is complete.
- **Aliasing stable draw records:** Core and renderer may otherwise retain and
  mutate the same object at incompatible times. Define render as a synchronous
  snapshot read and keep separate renderer-owned normalized storage, especially
  for on-demand picking.
- **Revision proliferation:** too many categories recreate the dependency graph
  under new names. Review taxonomy and merge categories with identical work.
- **Selection staleness:** not all selection producers may expose complete
  revisions. Retain conservative invalidation until each producer is proven.
- **Renderer API growth:** semantic built-in slots could multiply exports.
  Prefer properties on existing definitions/handles and check root exports and
  bundle fixtures.
- **Code migration disguised as deletion:** report combined Core and renderer
  line counts and dependencies at every milestone.
- **Premature generic helpers:** prototype locally, measure net deletion, and
  discard helpers that do not earn their abstraction.
- **Performance regression through cleaner layering:** retain structural
  benchmark assertions and confirm that hot paths allocate no patches.

## Unresolved questions

- Which existing Core owner should publish each revision without coupling
  general mark code to a renderer lifecycle?
- Which owners can publish a complete draw-geometry revision for scrolling,
  sticky axes, clipping, and culling, and which initially require conservative
  refresh?
- Can selection changes gain a complete revision contract in this project, or
  must some conservative invalidation remain?
- Should semantic properties be slots exposed directly on `MarkHandle`, or
  typed property groups owned by each mark definition?
- Does a renderer-generic compiled slot synchronizer produce a net reduction,
  or is the correct reusable unit Core's retained binding?
- Which renderer-neutral mark-data/property helpers have a natural existing
  home, and which should remain local rather than create utility modules?
- Does prepared conditional encoding delete enough work and code after retained
  bindings, or should Milestone 5 discard it?
- After stable Core draw reuse, is renderer normalization still a meaningful
  cost or source of garbage, and can separate internal visible/picking storage
  remove it without a public retained-draw API?

Resolve these at the named review gates with code-size, dependency, type, and
benchmark evidence. They must not silently become permanent dual paths.

## Project acceptance criteria

- Core contains no built-in WGSL uniform names.
- Stable renderer slots remain the canonical update API and are directly usable
  without a patch allocation.
- `webgpu-renderer` accepts materialized numeric draw rectangles and has no
  dependency on Core rectangles, accessors, geometry revisions, or view state.
- Retained occurrences reuse stable renderer-facing draw and geometry records;
  ordinary paints do not allocate replacement rectangles or command envelopes.
- Materialized geometry remains correct for scrolling, sticky axes, closeup
  transitions, clipping, culling, visible rendering, and picking without layout
  replay.
- Closure-backed rectangles are isolated as transitional Core sources and do
  not cross `WebGpuSurface`; removing them later does not require a renderer API
  migration.
- Core has one retained WebGPU binding per mark rather than overlapping adapter,
  frame, and surface state for the same lifetime.
- Normal clean paints do not traverse arbitrary configuration objects,
  rediscover dynamic properties, or rebuild dependency graphs.
- Explicit owner revisions cover every optimized mutable input; documented
  conservative selection cases are the only allowed fallback.
- The retained-frame, placement, picking, and teardown invariants remain true.
- The existing public renderer root API does not grow without an approved
  Milestone 2 or 4 rationale.
- Optional helpers are tree-shakeable and excluded from non-importing bundle
  fixtures.
- Combined source measurements show a material net simplification, aiming for
  the estimated 700–1,000-line Core reduction without merely moving code.
- Unit, type, lint, bundle, hardware benchmark, and MCCA manual verification
  pass at the scope specified above.
- Documentation explains the final ownership and invalidation model well enough
  that the performance-sensitive architecture is not accidentally flattened
  back into per-frame translation.
