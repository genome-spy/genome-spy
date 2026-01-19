# ScaleResolution refactor plan

## Observations for further improvement
- Initial-domain and zoom-clamp semantics are still implicit; document and test
  them alongside ScaleInteractionController.
- Domain aggregation still allocates arrays on each query; consider caching or
  reuse if profiling shows hot-path pressure.
- Range expression listeners are invalidated but not explicitly pruned; confirm
  lifecycle and add tests to guard against leaks.
- applyLockedProperties still enforces unit ranges; keep the transitional
  comment and revisit when pixel ranges are introduced.
- The `clip` default relies on `isZoomable()` and lazy scale access; keep as-is
  for now and revisit once resolution/clip wiring is cleaner.

## Allowed semantic fixes (to document + test)
- Fix isZoomed logic to report zoomed state correctly.
- Make getDataDomain() safe when no members provide a domain.
- Treat [0, 0] as a valid initialized domain.
- Ensure range expr refs do not leak listeners on reconfigure.
- Make initial-domain behavior explicit and non-drifting for zoom clamp.

## Goals
- Reduce cross-cutting responsibilities in a single class.
- Make domain and zoom behavior explicit and testable.
- Clarify locus/index behavior boundaries.
- Improve maintainability while allowing targeted semantic fixes.
- Minimize allocations in zoom paths to avoid GC pressure.

## Public API constraints
- The `ScaleResolutionApi` in `packages/core/src/types/scaleResolutionApi.d.ts`
  is public and must remain stable (method signatures and behavior).
- Refactors should be internal-only; any changes should preserve observable API
  semantics for listeners, domain access, and zooming behavior.

## Internal consumers to keep in sync
- Resolution wiring and cleanup in `packages/core/src/view/unitView.js`.
- Axis sharing logic in `packages/core/src/view/axisResolution.js`.
- Mark/axis render behavior depending on domain/range events.
- Range texture creation tied to scale range events (WebGL helper).
- Axis length workarounds that depend on unit ranges and view coords.

## Note on positional ranges
- Current GenomeSpy uses unit ranges (`[0, 1]`) for positional scales because it
  maps cleanly to WebGL. A future migration is planned toward pixel ranges
  similar to Vega. Any code that assumes unit ranges (locking, padding, axis
  length workarounds) should include a clarifying comment and be treated as
  transitional.

## scale.js context (no changes in this refactor)
- `packages/core/src/scale/scale.js` encodes additional domain/range rules and
  scale key inference adapted from Vega. It is hard to read but should remain
  untouched in this refactor session.
- Future work can split rules into smaller modules (domain, range, schemes,
  scale-key inference) and align the rule tables with `ScaleRules`, but this is
  explicitly out of scope for now.
