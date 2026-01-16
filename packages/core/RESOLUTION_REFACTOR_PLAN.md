# ScaleResolution refactor plan

## Current state after refactor
- ScaleResolution is mostly wiring across dedicated modules.
- Prop merging and defaults are handled by ScalePropsResolver + scaleDefaults.
- Domain aggregation and initial-domain tracking live in ScaleDomainAggregator.
- Scale instance creation/range handling lives in ScaleInstanceManager.
- Zoom/pan logic lives in ScaleInteractionController.
- Locus conversion helpers live in scaleLocus.
- Channel/type compatibility rules live in ScaleRules.

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
- Scale creation happens lazily in the `scale` getter; it is convenient but
  hides side effects. Prefer an explicit initialization step.

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

## Next steps to make scale creation explicit
1) Introduce an explicit `initializeScale()`/`ensureScale()` call that creates
   the scale after members are registered.
2) Make the `scale` getter side-effect-free (return cached instance only).
3) Update resolution wiring to call initialization during view resolution.
4) Add tests to confirm initialization happens once and is required before use.

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

## Explicit implementation steps
1) Add initial tests for new modules (ScaleRules, ScaleDomainAggregator,
   ScaleInstanceManager, ScaleInteractionController, scaleLocus helpers).
2) Make scale creation explicit: introduce `initializeScale()`/`ensureScale()`,
   make `scale` getter side‑effect‑free, update resolution wiring to call init.
3) Remove genome-specific logic from ScaleResolution: bind genome per locus
   scale at creation time; move complex conversions into scaleLocus/adapter and
   update aggregators/controllers to use adapters.
4) Add/adjust tests for explicit initialization and per-scale genome binding.
5) Add `scale.assembly` support (scaleDef only): resolve via genomeStore on
   scale creation, default to store’s default, throw on missing name.
6) Add/adjust tests for assembly selection and error behavior.
7) Run `npm test`, run `npm -ws run test:tsc --if-present`, and commit after
   each step.
