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
- Root init now uses subtree init helpers and subtree data loading, with scale
  reconfiguration handled by `loadViewSubtreeData`.
- Flow branches are pruned on subtree dispose, removing empty ancestors and
  detaching orphaned data sources.
- Concurrent loads for shared sources are deduplicated with an in-flight cache.
- Test helpers now use subtree init + subtree load; global `initializeData` is
  removed.

## Remaining work (resume checklist)

1) Subtree init consistency (root and dynamic)
- Ensure flow optimization + handle sync still run for all subtree insertions.
- Promote in-flight load caching to a persistent load-state per source if
  repeated loads should be skipped across time, not just concurrently.

2) View creation consistency (app-side)
- Replace direct `new` usage with `createOrImportView` where practical.
- Follow the same lifecycle: build subtree -> initializeViewSubtree -> attach ->
  dispose old subtree.
- Keep metadata/sidebar out of sample-extraction readiness checks.

3) Scale reconfiguration wiring
- Decide whether `updateNamedData` should trigger subtree-level reconfigure.

4) Tests to make resumption safe
- SubtreeDataReady boundaries (metadata vs. sample data) and ancestry checks.
- Shared data source caching across time (not just in-flight).
- Flow branch cleanup on metadata rebuild (no orphaned nodes/collectors).

## Notes for later

- Nearest data source boundary: when collecting sources for a subtree, stop
  descending once a view owns a data source. Readiness should not bubble past
  a nearer source owner.
- WebGL ordering: build subtree first, initialize flow + observers post-order,
  compile/init graphics in parallel, then initialize data and render.

## Progress estimate

[█████████████████████░░░░░] 72%
