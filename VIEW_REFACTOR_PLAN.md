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

2) LayerView dynamic child management (medium priority, avoid duplication)
- Goals:
  - Add/remove layer children without rebuilding the entire layer.
  - Reuse GridView/ConcatView lifecycle helpers where possible.
  - Centralize dynamic container lifecycle to avoid per-container duplication.

- Design direction:
  - Introduce a small shared helper (e.g., `ContainerMutationHelper`) that
    encapsulates the common lifecycle:
    create view -> insert -> init subtree -> load data -> configure opacity ->
    request layout.
  - Container-specific work stays local:
    - GridView/ConcatView: axes, gridlines, shared axis sync.
    - LayerView: axis resolution membership and scale resolution are already
      handled by UnitView; no shared axes, but needs consistent insertion,
      removal, and layout updates.

- API proposal (LayerView):
  - `addChildSpec(spec, index?)` for dynamic insertion.
  - `removeChildAt(index)` for removal.
  - Keep these thin: rely on the shared helper for lifecycle sequencing.

- Implementation steps (ordered):
  1. Extract shared dynamic lifecycle into a helper used by ConcatView.
  2. Add LayerView methods that call the helper with layer-specific insertion
     and removal callbacks.
  3. Ensure layout invalidation and reflow calls are made once per mutation.
  4. Update documentation/JSDoc for LayerView and helper usage.

- Tests (extensive):
  - Insert/remove updates spec order and children order.
  - Removing a child disposes subtree and clears flow handles.
  - Dataflow collectors count returns to zero after removal.
  - Layout reflow is requested on mutation.
  - Edge cases: removing out-of-range throws, inserting at index 0 reorders.

3) Scale reconfiguration wiring (low priority)
- Decide whether `updateNamedData` should trigger subtree-level reconfigure.

## Notes for later

- Nearest data source boundary: when collecting sources for a subtree, stop
  descending once a view owns a data source. Readiness should not bubble past
  a nearer source owner.
- WebGL ordering: build subtree first, initialize flow + observers post-order,
  compile/init graphics in parallel, then initialize data and render.

## Progress estimate

[██████████████████████░░░] 78%
