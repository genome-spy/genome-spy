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

1) GridView incremental child management (high priority, needs extensive tests)
- Goals:
  - Add/remove children without rebuilding the entire grid.
  - Ensure axes, titles, grid lines, scrollbars, and selection overlays are
    created and disposed correctly.
  - Keep shared axes consistent after insert/remove operations.
  - Use the existing subtree dataflow helpers for new children.

- API design (GridView):
  - `insertChildViewAt(view, index)` inserts a GridChild at a position.
  - `appendChildView(view)` convenience wrapper.
  - `removeChildView(view)` / `removeChildAt(index)` removes a child.
  - `syncSharedAxes()` creates or disposes shared axes based on resolutions.
  - `invalidateSizeCache()` is called after changes (already exists on View).
  - Document all methods with JSDoc: intended callers, expected lifecycle
    ordering, and required follow-up calls (layout reflow, data init).

- API design (GridChild):
  - `disposeAxes()` (or `resetDecorations()`) disposes title, axes, grid lines,
    scrollbars, selection rect, backgrounds.
  - `createAxes()` assumes a clean slate (calls `disposeAxes()` first or clears
    internal maps before recreating).
  - Add a short "Users guide" comment block that explains how GridChild is
    owned by GridView and why direct usage is not expected.

- API design (ConcatView):
  - `addChildSpec(spec, index?)` uses `createOrImportView` + `insertChildViewAt`.
  - `removeChildAt(index)` calls GridView removal + subtree dispose.
  - Document dynamic insertion/removal lifecycle: axes, opacity, subtree init,
    data load, layout reflow.

- Implementation steps (ordered):
  1. Add `GridChild.disposeAxes()` and call it from `GridView.#disposeGridChild`.
  2. Add `GridView.syncSharedAxes()` and call it from:
     - `createAxes()` (after per-child axes)
     - child insert/remove paths
  3. Add `GridView.insertChildViewAt` + `removeChildAt` that:
     - handle `layoutParent` assignment
     - dispose subtree on removal
     - sync shared axes
     - invalidate size cache + request layout reflow
  4. Add ConcatView helpers that:
     - create view via `createOrImportView`
     - insert into grid
     - call `initializeViewSubtree` + `loadViewSubtreeData`
     - call `configureViewOpacity` after axes exist
  5. Wire a minimal call site (sample use) to validate behavior.

- Tests (extensive, required):
  - Insert/remove preserves shared axes (created when needed, removed when no
    members remain).
  - GridChild decorations are disposed (no orphaned title/axis views).
  - Size cache invalidation triggers layout changes on insert/remove.
  - Subtree dataflow init + load runs once for inserted views.
  - Removal prunes dataflow branches (collector/source cleanup).

2) Subtree init consistency (medium priority)
- Ensure flow optimization + handle sync still run for all subtree insertions.
- Consider persistent load-state per source if reloads should be skipped across
  time, not just concurrently.

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
