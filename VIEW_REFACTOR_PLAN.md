# View Refactor Plan

## Problem statement

Dynamic mutation of the view hierarchy (add/remove views) is fragile because
initialization is global and one-way: views, dataflow, and scale/axis resolution
are built once from the root and never cleanly torn down. As a result, dynamic
changes leak listeners, dataflow nodes, and GPU resources, and some view setup
steps are skipped for newly created subtrees. The goal is to incrementally
refactor the architecture so that view subtrees can be added and removed safely
without requiring a full rebuild or relying on a global registry.

## Current state (implemented)

- Subtree lifecycle helpers exist (`initializeViewSubtree`,
  `finalizeSubtreeGraphics`, `disposeSubtree`) and are used in metadata rebuild.
- Flow handles are view-owned; `DataFlow` host maps are removed and observers
  are managed via `Collector.observe()` + `View.registerDisposer()`.
- Subtree data-ready signaling exists: `loadViewSubtreeData` emits
  `subtreeDataReady`, and sample extraction listens to it. Global `dataLoaded`
  broadcast is removed.
- Metadata rebuild now uses subtree init + subtree data loading and cleans up
  subscriptions/listeners on dispose.
- Scale/axis resolution membership can be removed during disposal, and unit
  views dispose marks and listener wiring.

## Remaining work (resume checklist)

1) Replace global init path in `genomeSpy.js`
- Move flow initialization/loading and `reconfigureScales` into subtree-aware
  helpers, driven by view creation or subtree insertion.
- Ensure flow optimization + handle sync still run when subtrees are added.
- Add per-data-source load-state (cached load promise) to avoid duplicate loads
  when sources are shared across subtrees.

2) Dataflow lifecycle for subtree replacement
- Define how subtree flow branches are attached to the global graph and how
  replaced branches are pruned or detached (flowBuilder or flowInit cleanup).
- Ensure collectors and observers are removed when a subtree is disposed.

3) View creation consistency (app-side)
- Replace direct `new` usage with `createOrImportView` where practical.
- Follow the same lifecycle: build subtree -> initializeViewSubtree -> attach ->
  dispose old subtree.
- Keep metadata/sidebar out of sample-extraction readiness checks.

4) Scale reconfiguration wiring
- Decide where scale reconfiguration belongs for subtree data loads.
- Wire `reconfigureScales` to subtree init or subtree data-ready as appropriate.

5) Tests to make resumption safe
- SubtreeDataReady boundaries (metadata vs. sample data) and ancestry checks.
- Shared data source caching (one load, many subtrees).
- Flow branch cleanup on metadata rebuild (no orphaned nodes/collectors).

## Notes for later

- Nearest data source boundary: when collecting sources for a subtree, stop
  descending once a view owns a data source. Readiness should not bubble past
  a nearer source owner.
- WebGL ordering: build subtree first, initialize flow + observers post-order,
  compile/init graphics in parallel, then initialize data and render.

## Progress estimate

[█████████████████░░░░░░░░░] 63%
