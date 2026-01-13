# View Refactor Plan (Draft)

## Problem statement

Dynamic mutation of the view hierarchy (add/remove views) is fragile because
initialization is global and one-way: views, dataflow, and scale/axis resolution
are built once from the root and never cleanly torn down. As a result, dynamic
changes leak listeners, dataflow nodes, and GPU resources, and some view setup
steps are skipped for newly created subtrees. The goal is to incrementally
refactor the architecture so that view subtrees can be added and removed safely
without requiring a full rebuild or relying on a global registry.

## Key findings (current state)

- Layout children are replaced without any view teardown. Old views keep
  interaction listeners, mark instances, and closures alive, which leads to
  leaks and stale rendering state when dynamic views are replaced.
- Dataflow construction is additive. `buildDataFlow(root, existingFlow)`
  mutates a shared `DataFlow` and never removes the old nodes or observers for
  replaced views; old collectors and data sources remain reachable.
- Observers are one-way. `flow.addObserver` is used for marks and never
  unregistered, so any re-build of metadata views stacks new observers on top
  of old ones.
- Scale and axis resolution are not reversible. `ScaleResolution.addMember`
  only grows the membership; there is no removal or invalidation on view
  deletion, so domains and event listeners can include stale views.
- Store subscriptions are not disposed. `subscribeTo` returns an unsubscribe
  function but most views do not hold or call it, keeping views alive via
  Redux closures even after removal.
- Action augmenters are not disposed. `SampleView` registers an augmenter that
  is never removed, causing similar lifetime leaks for the view.
- Global initialization is static. `GenomeSpy` runs one-time setup such as
  `configureViewOpacity`, `createAxes`, `optimizeDataFlow`, and mark init.
  Dynamically inserted views bypass these steps or run incomplete subsets.
- Dataflow and view hierarchies are only "decoupled" in theory: flow graphs are
  derived from `dataParent` trees built from the view hierarchy, so replacements
  must be coordinated; without teardown, both hierarchies drift out of sync.

## Recent updates (implemented)

- Added view disposal hooks and teardown paths (`dispose`, `disposeSubtree`) and
  wired `UnitView.dispose` to remove scale listeners and dispose marks.
- Added removal for scale/axis resolution members and invalidation of cached
  scale resolutions.
- Added observer cleanup for collectors and flow-handle-based teardown.
- Added subtree initialization helpers (`initializeSubtree`,
  `finalizeSubtreeGraphics`) to build flow and initialize marks per subtree.
- Dropped host-based `DataFlow` lookup and replaced it with per-view flow
  handles; `DataFlow` now tracks only data sources and collectors.
- Metadata rebuild now uses subtree init and removes old dataflow hosts before
  rebuilding; title-view data source hacks removed.
- Metadata view now unsubscribes from Redux, unregisters its attribute info
  source, and removes its ancestor mousemove listener on dispose.
- Sample label view now unsubscribes and unregisters its attribute info source
  on dispose; sample view now removes its action augmenter and store
  subscription on dispose.
- Grid and facet view replacement now dispose old children (including grid
  decorations), preventing view/mark/resource leaks.
- Tests added/extended: `viewDispose`, `viewUtils`, `paramMediator`,
  `dataFlow`, and `metadataView` dynamic rebuild coverage.

## Proposed fixes (incremental direction)

- Introduce explicit lifecycle hooks for views:
  - `initializeSubtree()` for post-order setup (axes, scale resolution, mark
    encoders, flow build/init, and initial data propagation).
  - `disposeSubtree()` for pre-order teardown (unsubscribe, remove listeners,
    release mark resources, detach flow nodes).
- Build dataflow per subtree rather than globally. When a container completes
  child creation, build and initialize a flow branch for that subtree and
  attach it to the nearest ancestor flow node if needed.
- Replace `DataFlow` host mapping with view-local handles. Each view can
  optionally expose `flowNode` / `collector` / `dataSource` via a small
  interface so marks and scales can bind to the local branch without a global
  registry.
- Add removal paths for scale/axis resolution:
  - track membership per view and allow removal;
  - ensure resolution listeners are detached when views are disposed.
- Ensure mark lifecycle parity:
  - mark init (`initializeEncoders`, `initializeGraphics`, `initializeData`)
    should be triggered when a subtree is ready;
  - mark teardown should release GPU buffers/textures to avoid leaks.
- Introduce explicit teardown for Redux-based subscriptions and action
  augmenters so removed views do not hold references to the store.

## Proposed refactor phases (suggested)

### Phase 0: Instrumentation and tests

- Add tests around dynamic add/remove for metadata views to surface leaks:
  - replacing metadata should not multiply observers or listeners
  - replacing metadata should not leave old flow nodes reachable
  - scale membership should reflect only current views
- Add minimal lifecycle hooks in tests to verify teardown is invoked.

Status: started. Metadata rebuild test covers observer/collector sizes and
unsubscribe behavior. Core tests cover disposal and flow-handle wiring.

### Immediate next steps (metadata-first)

- Focus on `MetadataView` subtree lifecycle first; postpone Redux teardown
  unless it becomes a blocker.
- Introduce a local subtree init path for metadata that replaces:
  - global `buildDataFlow` usage in `#setMetadata`
  - the title-view data source load hack
- Add a minimal flow handle on the metadata subtree so unit views can access
  their collector/source without global `DataFlow` lookup.
- Add teardown for metadata subtree only (observer removal, flow detachment,
  mark disposal) to prevent leaks during add/remove.

Status: partial. Subtree init helpers exist and metadata rebuild uses them;
flow handles are in place.

### Phase 1: Safe teardown without changing architecture

- Add `disposeSubtree()` on `View` and implement in `UnitView` to dispose marks.
- Track and unsubscribe store listeners in views (`SampleLabelView`,
  `MetadataView`, `SampleView` action augmenters). This can be deferred unless
  it becomes a blocker for metadata removal.
- Add a way to unregister flow observers and scale listeners associated with
  a view (even if flow stays global for now).

Status: mostly done. Disposal hooks, mark cleanup, scale/axis membership
removal, observer cleanup, and app-level unsubscribe paths are implemented.
DataFlow host registry is removed; handles are the primary access path.

### Phase 2: Subtree dataflow init

- Create a helper to build flow for a subtree and initialize its data sources,
  collectors, and marks without requiring a global root pass.
- Update metadata view rebuild to:
  - dispose old subtree
  - rebuild views
  - build/init flow for the new subtree
  - reconfigure scales locally

Status: helper exists and metadata rebuild uses it; `DataFlow` remains a global
graph/optimizer, while views access flow via handles.

## Notes on initialization order (WebGL constraints)

- Avoid touching GPU resources until the view subtree is structurally ready.
  Shader compilation should run in parallel but marks must not be used until
  initialization completes.
- Proposed split for each subtree:
  - Phase A (sync, post-order): build views, build flow branch, wire observers,
    register scale/axis resolutions, schedule data source loads.
  - Phase B (async, parallel): kick `mark.initializeGraphics()` across unit
    views and await readiness.
  - Phase C (sync): run `initializeData()` and `updateGraphicsData()` once
    graphics are ready; request render.
- This should replace ad hoc "find title views and load data sources" hacks
  by letting local subtrees initialize their own sources on completion.

## Notes on early data loading

- Goal: trigger data loads as soon as a subtree is ready while still benefiting
  from global optimization (shared sources).
- Proposed sequence for subtree init:
  - build subtree flow
  - run `optimizeDataFlow` globally
  - sync flow handles to canonical data sources
  - load only canonical data sources for the subtree (guarded by load state)
- Requires a load-state or cached load promise on each data source to avoid
  duplicate fetches when sources are shared across subtrees.

### Phase 3: Remove `DataFlow` registry

- Migrate from global host-based lookup to view-local flow handles.
- Replace `flow.findCollectorByKey`/`findDataSourceByKey` with direct access
  from the owning view or flow branch.
- Simplify dataflow ownership: each view or subtree can own its flow node and
  be responsible for disposal.

Phase 3 checklist (concrete tasks):

- Define a minimal flow-handle interface, e.g., `{ dataSource, collector }`,
  stored on views that participate in dataflow.
- Attach handles during `buildDataFlow` and re-sync after optimization.
- Use local handles in view code paths (no global lookup fallback).
- Ensure subtree init syncs flow handles and uses canonical data sources.
- Remove host-map lookups; keep `DataFlow` as a graph/optimizer container only.
- Add tests that assert flow-handle availability in subtree init and selection
  rect updates.

Status: in progress. Host maps removed; flow handles are required for view-owned
sources/collectors and selection rect has handle coverage.

### Phase 4: Resolution and layout cleanup

- Make scale/axis resolution membership fully dynamic with add/remove.
- Ensure layout cache invalidation and opacity config are triggered when views
  are added or removed.

## Open questions / design constraints

- How should shared named sources behave across subtrees when reusing datasets?
- Should resolution membership be stored on `ScaleResolution` or on the view?
- What is the minimal interface for view <-> flow coupling that keeps tests
  stable but avoids concrete type dependencies?

## Current pain points by file

- `packages/app/src/sampleView/metadata/metadataView.js`: now uses subtree init
  and cleans up subscriptions/listeners on dispose, but relies on manual
  `reconfigureScales`.
- `packages/app/src/sampleView/sampleLabelView.js`: now unsubscribes and removes
  its attribute info source on dispose.
- `packages/app/src/sampleView/sampleView.js`: now removes its action augmenter
  and store subscription on dispose; dynamic sidebar lifecycle still relies on
  global init.
- `packages/core/src/genomeSpy.js`: global one-shot init assumes static tree and
  does not support incremental subtree init/teardown.
- `packages/core/src/view/flowBuilder.js`: builds flow from current view tree
  but has no corresponding teardown/prune for replaced branches.
- `packages/core/src/data/dataFlow.js`: now a graph/optimizer container; still
  needs load-state tracking for early-loading without duplicate fetches.
- `packages/core/src/view/scaleResolution.js`: membership grows without removal,
  so domains/listeners can outlive the owning view.
- `packages/core/src/view/unitView.js`: resolves scale/axis and registers scale
  listeners at construction; lacks a remove/unresolve path.
