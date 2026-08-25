# Core–WebGPU integration simplification plan

Status: Proposed. The interaction-performance work is complete; this plan
preserves its retained-frame architecture while reducing the weight of the
Core–WebGPU integration.

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
  path where they can be counted reliably.

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

## Goals

- Preserve the renderer's small handle-and-slot API as the canonical low-level
  contract.
- Remove duplicated change detection and retained-state bookkeeping from Core.
- Replace built-in raw uniform names in Core with semantic renderer properties.
- Express invalidation through explicit Core-owned revisions rather than an
  adapter-specific dependency graph.
- Compile stable synchronization operations once per mark/configuration shape
  and perform work only for dirty marks.
- Improve public types and seam tests so the integration needs fewer casts,
  implicit assumptions, and implementation-shaped fixtures.
- Reduce source size, hot-path allocation, and conceptual surface area without
  compromising the retained-frame performance gains.
- Keep `webgpu-renderer` modular, extensible, and tree-shakeable.

## Non-goals

- Replacing stable slots with a required `update(patch)` API.
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
scale, packed data, resource, placement, and selection. Combine categories when
they always invalidate the same compiled work. Add a category only when a
benchmark or correctness case needs a distinct action.

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

| Area | Intended change | Explicit boundary |
| --- | --- | --- |
| Core marks and mutable resources | Backend-neutral revisions | No WebGPU imports or callbacks |
| `ViewRenderingContext` | At most a small shared invalidation contract | No retained GPU state |
| Core WebGPU adapter | Delete dependency maps and compile bindings | Remains the grammar translator |
| Core WebGPU surface | Delete reflected diffing and duplicate state | Remains pass/resource orchestration |
| `webgpu-renderer` handles | Semantic built-in slots and complete types | Slots remain canonical |
| Renderer package exports | Optional helper only if proven smaller | Root API stays small by default |
| WebGL and Canvas2D coordinators | Optional shared settled-layout traversal | Backend lifecycles stay explicit |
| Core and renderer documentation | Final ownership and migration notes | No App-specific concepts |

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
- Make `liveValue()` explicitly mark a value dynamic and delete recursive
  retainability rewriting where this makes it redundant.
- Reuse the existing encoder construction path for conditional branches and
  delete `createBranchEncoder()` if behavior remains identical.
- Remove production `WebGpuSurface.useMark()` if it is only a test convenience;
  test through retained-frame or focused internal seams instead.
- Remove `toDrawRect()` if the renderer contract can consume the existing rect
  shape directly.
- Resolve occurrence option ranges when packed data changes rather than caching
  them by draw-options identity on every draw.
- Move renderer-neutral mark-data/property helpers out of immediate-rendering
  modules when doing so removes a misleading dependency without adding a new
  abstraction layer.
- Investigate `noFadingOnPointSelection`: either wire its intended renderer
  behavior with a contract test or remove the unused forwarding path and record
  the parity decision.

### Verification

- Focused Core WebGPU and renderer unit suites.
- Renderer TypeScript check and the new type fixtures.
- Before/after source, test, export, and bundle-size report.
- One hardware-backed smoke run to confirm visible and picking passes.

### Tentative commits

- `refactor(webgpu): remove redundant Core adapter paths`
- `fix(webgpu-renderer): complete Core integration types`

### Review gate

Confirm that the milestone has a net simplification. Revert or defer helpers
that merely relocate code. Confirm that no public renderer root export was
added accidentally.

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

## Milestone 3: Add backend-neutral Core revisions

### Intended outcome

Core tells render backends what category changed. The WebGPU adapter no longer
maintains a parallel graph of expression, scale, resource, and selection
dependencies.

### Work

- Trace current watcher and invalidation ownership for expressions, scales,
  packed data, resources, placement, and selections.
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
- Delete adapter-owned dependency maps and watchers as their owner-provided
  replacements become authoritative.

### Verification

- WASD pan/zoom, closeup toggle, and closeup wheel remain layout-free.
- Expression, scale, data, resource, placement, and selection changes each
  trigger the required update and no unrelated recompilation.
- Visible and picking frames observe the same logical revision state.
- Core WebGL behavior and tests remain unchanged or consume only genuinely
  backend-neutral contracts.
- Counts show a net decrease in retained maps and watcher registrations.

### Tentative commits

- `refactor(core): expose mark rendering revisions`
- `refactor(webgpu): consume owner-provided revisions`

### Review gate

Review the revision taxonomy before removing compatibility paths. Merge
categories that do the same work and reject revisions whose only purpose is to
mirror a WebGPU implementation detail.

## Milestone 4: Compile one retained binding per mark

### Intended outcome

Each Core mark has one WebGPU-owned binding that compiles semantic slot updates
once and owns the adapter's retained synchronization state.

### Work

- Define a single retained binding record for a Core mark, including renderer
  handle, compiled updater records, observed revisions, packed occurrence data,
  and resources whose lifetime belongs to that binding.
- Compile updater records when configuration shape changes. Normal paints use
  revisions to select records and call stable slots directly.
- Consolidate the remaining adapter `WeakMap`s, frame mark state, and surface
  retained records into that binding where their lifetimes match.
- Delete surface-side arbitrary-object traversal, general configuration
  snapshots/equality, and dynamic-property rediscovery made redundant by the
  compiled records.
- Keep typed-array mutation semantics explicit. Never skip a required upload
  because a mutable value retained its identity.
- Prototype the binding compiler in Core. Move only a generic handle/slot
  synchronizer to an optional renderer subpath if measured total code and
  bundle results satisfy the ownership decision above.
- Keep direct slot use public even if an optional helper is accepted.

### Verification

- Steady-state clean frames perform no mark configuration traversal and create
  no patch/update objects.
- Dirty frames touch only marks and updater groups selected by revisions.
- Renderer handles and GPU resources are released exactly once on rebuild and
  teardown.
- The DPR 1 interaction benchmark preserves the completed plan's structural
  counters and does not regress materially within its established noise model.
- MCCA manual profiling confirms that synchronization remains efficient.
- Total Core-plus-renderer production size falls; any optional renderer helper
  is absent from a fixture that does not import it.

### Tentative commits

- `refactor(webgpu): compile retained mark bindings`
- `refactor(webgpu): remove reflected config synchronization`

### Review gate

Confirm ownership and tree shaking before proceeding. If the generic renderer
helper fails the size or dependency test, keep the binding compiler in Core and
remove the prototype from the renderer.

## Milestone 5: Reconcile coordinators and command preparation

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
- Remove obsolete immediate-rendering responsibilities and imports revealed by
  the retained binding model.
- Reassess complete placement updates using the benchmark counters. Keep them
  unchanged unless they have become a measured bottleneck.

### Verification

- Backend coordinator lifecycle and error-order tests.
- Conditional encoder and branch parity tests.
- Focused WebGL, Canvas2D, and WebGPU tests for any shared helper.
- Net production-code reduction across all affected backends.

### Tentative commits

- `refactor(core): share settled-layout traversal`
- `refactor(webgpu): prepare stable encoder branches`

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
  ownership boundaries, and performance invariants.
- Update renderer README/API and migration notes only for public contracts that
  actually changed.
- Record final Core, renderer, test, export, bundle, allocation, and benchmark
  comparisons against the baseline.
- Reconcile every incomplete item as complete or discarded with rationale.
- Commit the reconciled plan, then delete it in a later integration commit as
  required by the repository workflow.

### Verification

- Focused Core WebGPU and renderer suites.
- Workspace TypeScript checks and lint for affected packages.
- Renderer tree-shaking/bundle fixtures.
- Hardware-backed DPR 1 benchmark and manual MCCA smoke profile.
- Visible/picking correctness, resize, resource teardown, facets through
  placement, closeup transition, and vertical closeup scrolling.

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
the retained binding and invalidation explanation; the renderer README owns
public slots and custom-program escape hatches. Keep detailed transition notes
in the renderer migration plan rather than expanding the primary README.

## Risks and mitigations

- **Missed mutable updates:** identity does not reveal typed-array mutation.
  Require revisions or narrow snapshots for mutable values and test in-place
  updates.
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

Resolve these at the named review gates with code-size, dependency, type, and
benchmark evidence. They must not silently become permanent dual paths.

## Project acceptance criteria

- Core contains no built-in WGSL uniform names.
- Stable renderer slots remain the canonical update API and are directly usable
  without a patch allocation.
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
