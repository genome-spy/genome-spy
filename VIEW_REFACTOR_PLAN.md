# View Refactor Plan

## Problem statement

Dynamic mutation of the view hierarchy (add/remove views) is fragile because
initialization is global and one-way: views, dataflow, and scale/axis resolution
are built once from the root and never cleanly torn down. As a result, dynamic
changes leak listeners, dataflow nodes, and GPU resources, and some view setup
steps are skipped for newly created subtrees. The goal is to incrementally
refactor the architecture so that view subtrees can be added and removed safely
without requiring a full rebuild or relying on a global registry.

## Remaining work (focused)

1) Subtree init consistency (medium priority)
- Ensure flow optimization + handle sync still run for all subtree insertions.
- Consider persistent load-state per source if reloads should be skipped across
  time, not just concurrently.

2) LayerView dynamic child management (done)
- Implemented `ContainerMutationHelper` and refactored ConcatView to use it.
- Added LayerView dynamic methods (`addChildSpec`, `removeChildAt`) via helper.
- Added LayerView tests: insertion ordering, removal cleanup, error cases.

3) Scale reconfiguration wiring (low priority)
- Decide whether `updateNamedData` should trigger subtree-level reconfigure.

## Notes for later

- Nearest data source boundary: when collecting sources for a subtree, stop
  descending once a view owns a data source. Readiness should not bubble past
  a nearer source owner.
- WebGL ordering: build subtree first, initialize flow + observers post-order,
  compile/init graphics in parallel, then initialize data and render.

## Progress estimate

[████████████████████████░] 90%
