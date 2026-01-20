# Lazy Subtree Initialization Plan

## Goal

Defer dataflow and mark initialization for views that are hidden at startup.
Hidden subtrees should not create flow branches, collectors, or GPU resources,
and should not load data until they become visible. When visibility changes,
initialize only the newly visible subtree.

## Visibility semantics

- Use `View.isConfiguredVisible()` as the authoritative predicate.
- Hidden subtrees are hard boundaries: skip descendants when traversing.
- Hidden views **do not** contribute to shared scale domains until they are
  visible. Domains will expand when a subtree is made visible.

## Design overview

1) Build view hierarchy eagerly (spec parsing, view creation, scale/axis
   resolution) but **defer dataflow + graphics init** for hidden subtrees.
2) Add a per-view initialization state:
   - `none` (not initialized)
   - `pending` (initialization in progress)
   - `ready` (initialized)
3) Extend `initializeViewSubtree` / `collectNearestViewSubtreeDataSources` with
   a visibility predicate so hidden views are skipped entirely.
4) When a hidden subtree becomes visible, schedule initialization for that
   subtree (async, not inline in render/layout).

## Implementation steps

1. Add initialization state to `View` (or a small helper map keyed by view):
   - Track `initializationState` per view.
   - Guard against double-initialization and re-entrant calls.
   - Status: done.

2. Update flow init helpers:
   - Add a `viewPredicate` parameter to `initializeViewSubtree` and
     `collectNearestViewSubtreeDataSources`.
   - When a view fails the predicate, skip it and its descendants.
   - Status: done.

3. Add a lazy init entry point:
   - `initializeVisibleSubtree(root, predicate)` that runs the flow init and
     data load for visible views only.
   - Keep it idempotent: if the subtree is already `ready`, skip.
   - Status: done (`initializeVisibleViewData`).

4. Triggering initialization on visibility change:
   - Prefer a scheduled async hook (microtask or animator callback) to avoid
     re-entrant layout/render.
   - The trigger can be:
     - a broadcast message, or
     - a visibility-aware traversal after `requestLayoutReflow`.
   - Status: done in app wiring; core now refreshes layout + canvas size after
     lazy init to avoid manual resize.

5. Shared sources:
   - If a visible subtree shares a data source with existing visible branches,
     the load will re-run for that source.
   - This is acceptable for now; consider targeted propagation later to avoid
     redundant updates (see ARCHITECTURE TODO).
   - Status: pending (optimization).

## Tests

1) Hidden subtree is not initialized at startup:
   - No collectors or observers for hidden unit views.
   - No data source loads triggered by hidden subtrees.
   - Status: done.

2) Visibility toggle:
   - Make a subtree visible → initialization runs once.
   - Repeated toggles do not duplicate collectors/observers.
   - Status: done.

3) Shared source behavior:
   - Adding a visible subtree with a shared source does not create duplicate
     observers in existing views.
   - Status: pending.

4) Scale domain behavior:
   - Shared scale domains expand only after hidden views become visible.
   - Status: done.
