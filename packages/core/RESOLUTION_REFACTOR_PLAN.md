# ScaleResolution refactor plan

## Current state after refactor
- ScaleResolution is mostly wiring across dedicated modules.
- Prop merging and defaults are handled by ScalePropsResolver + scaleDefaults.
- Domain aggregation and initial-domain tracking live in ScaleDomainAggregator.
- Scale instance creation/range handling lives in ScaleInstanceManager.
- Zoom/pan logic lives in ScaleInteractionController.
- Locus conversion helpers live in scaleLocus.
- Channel/type compatibility rules live in ScaleRules.
- Scale access is split into `scale` (initialized-only) and `getScale()` (lazy).

## Tests to add or move (now that logic is split)
- ScaleRules (`packages/core/src/view/scaleRules.js`):
  - Channel/type compatibility errors are explicit and stable.
  - Default scale type lookup is deterministic and documented.
  - Locked constraints apply only when intended (positional non-ordinal, opacity).
- ScaleDomainAggregator (`packages/core/src/view/scaleDomainAggregator.js`):
  - Configured domain union across multiple members.
  - Data-derived domain union with no configured domain.
  - Behavior when no member provides a domain.
  - Initial domain captured once, not drifting with data reconfigure.
  - Constant domain [0, 0] treated as initialized.
- ScaleInstanceManager (`packages/core/src/view/scaleInstanceManager.js`):
  - Range expr refs update scale on param change.
  - Range listener cleanup when reconfiguring with new range.
  - Reverse range behavior consistent for discrete and continuous.
- ScaleInteractionController (`packages/core/src/view/scaleInteractionController.js`):
  - ZoomTo with duration updates and final domain.
  - Zoom extent clamp behavior for locus and non-locus.
  - isZoomed correctly reflects non-initial domain.
- Locus conversions (`packages/core/src/genome/scaleLocus.js`):
  - to/from chromosomal interval and scalar domain.

## Observations for further improvement
- Initial-domain and zoom-clamp semantics are still implicit; document and test
  them alongside ScaleInteractionController.
- Domain aggregation still allocates arrays on each query; consider caching or
  reuse if profiling shows hot-path pressure.
- Range expression listeners are invalidated but not explicitly pruned; confirm
  lifecycle and add tests to guard against leaks.
- applyLockedProperties still enforces unit ranges; keep the transitional
  comment and revisit when pixel ranges are introduced.
- Genome-specific logic still seeps into ScaleResolution via helper callbacks;
  refactor toward scale-local genome binding for locus scales.
- The `clip` default relies on `isZoomable()` and lazy scale access; keep as-is
  for now and revisit once resolution/clip wiring is cleaner.
- Lazy scale creation should flow through `getScale()`; keep `scale` as
  initialized-only and document the intent in JSDoc.

## Allowed semantic fixes (to document + test)
- Fix isZoomed logic to report zoomed state correctly.
- Make getDataDomain() safe when no members provide a domain.
- Treat [0, 0] as a valid initialized domain.
- Ensure range expr refs do not leak listeners on reconfigure.
- Make initial-domain behavior explicit and non-drifting for zoom clamp.

## Next steps to remove genome-specific logic from ScaleResolution
1) Bind genome to locus scales at creation time (per-scale, immutable). This
   enables per-channel genomes for synteny/dot plots without shared state.
2) Move `toComplex`, `fromComplex`, and `fromComplexInterval` into `scaleLocus`
   (or a small locus adapter) so conversions operate on the scale instance,
   not on view/context.
3) Update ScaleDomainAggregator and ScaleInteractionController to accept a
   conversion adapter based on the scale type (locus vs non-locus), not a
   `getGenome` callback.
4) Remove `getGenome()` from ScaleResolution; keep ComplexDomain support by
   delegating to the adapter.
5) Add tests for per-scale genome binding and conversion behavior (ensure
   x/y scales can carry different genomes).

## Scale initialization contract (Option 3)
1) Keep `scale` as initialized-only and fail fast when accessed early.
2) Provide `getScale()` as the lazy-init entry point for early call sites.
3) Update internal call sites (encoders, interaction, tick sources, view
   helpers) to use `getScale()` when initialization order is uncertain.
4) Add/adjust tests that cover early access paths without requiring a
   centralized initialization step.

## Future extension: per-scale assembly selection
- Add `scale.assembly` (scaleDef only) to select a genome assembly for locus
  scales. If not defined, use the default genome from `genomeStore`.
- Resolve the genome at scale creation time and bind it to the locus scale
  instance; never re-query later.
- If the named assembly is not found, throw.

## Definition of done for follow-up changes
- Changes stay internal; `ScaleResolutionApi` remains stable.
- New tests cover rule/behavior changes in the new modules.
- Run the full Vitest suite (`npm test`).
- Make a commit per logical change.
- No new per-frame allocations in zoom paths.
- All affected internal consumers still receive domain/range events as before.

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

## Explicit implementation steps (completed)
1) Added initial tests for the new helper modules.
2) Adopted the `getScale()` contract and updated internal call sites.
3) Moved locus conversions to scaleLocus helpers and bound genomes at scale
   creation time.
4) Added tests for locus conversions and genome binding.
5) Added `scale.assembly` support (scaleDef only) with default/throw behavior.
6) Added tests for assembly selection and error handling.
7) Ran `npm test` and `npm -ws run test:tsc --if-present`, committing per step.
