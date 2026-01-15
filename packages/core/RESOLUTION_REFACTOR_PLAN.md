# ScaleResolution refactor plan

## Current concerns handled in ScaleResolution
- Merge scale properties from multiple views (including per-channel defaults).
- Resolve scale type and domain, including configured vs data-derived.
- Create and configure the Vega scale instance and its range.
- Track and notify domain/range listeners.
- Support zooming, panning, animated transitions, and zoom extent rules.
- Handle genome-specific locus/index conversions and extent logic.
- Apply channel-specific locked properties (e.g., unit range for positional).
- Provide utility methods (axis length, invert helpers, zoom state).

## Concerns that likely do not belong here
- Genome/locus conversions and extent rules. These are specific to locus/index
  scale types and could live in a locus-scale adapter or in scaleLocus.
- Default channel-specific scale props (schemes, size ranges, angle ranges).
  These are policy and theme-ish decisions, not resolution logic.
- Animated transition logic (eerp/easing) tied to zoomTo. That could live in a
  higher-level interaction or a zoom controller, not in the scale resolver.
- Mixed prop merging + domain/range logic in a single step. Merging scale props
  should be isolated from domain/range decisions for clarity and testability.
- Rules for channel/type compatibility and default constraints live inline and
  are hard to audit. These should be centralized and named.

## Proposed split
1) ScalePropsResolver
   - Inputs: channel, data type, member channelDefs.
   - Output: merged props with defaults, excluding domain/range.
   - Knows about default scale type per channel.

2) ScaleInstanceManager
   - Owns the Vega scale instance creation/configuration.
   - Applies range, handles expr-ref ranges, annotates props.
   - Provides reconfigure() with no interaction logic.

3) ScaleDomainAggregator
   - Collects configured and data-driven domains across members.
   - Owns domain merging logic and initial-domain semantics.
   - Should be explicit about "initial" vs "current" domain.
   - Should be the only place that decides how domain/range interact
     (e.g., domainMid bootstrapping).

4) ScaleInteractionController
   - Owns zoom/pan, zoom extent, zoom state, transitions, listeners.
   - Takes a scale instance and a domain provider.

5) LocusScaleAdapter (or move into scaleLocus)
   - Handles to/from complex locus conversions.
   - Handles genome extent and chromosomal intervals.

6) ScaleRules module (new)
   - Centralizes channel/type compatibility rules.
   - Encapsulates default scale types per channel/data type.
   - Encapsulates locked constraints (e.g., positional unit ranges, opacity clamp).
   - Exposes a small, testable API so ScaleResolution can be mostly wiring.

## Tests to add or move
- Rules/compatibility:
  - Channel/type compatibility errors are explicit and stable.
  - Default scale type lookup is deterministic and documented.
  - Locked constraints apply only when intended (positional non-ordinal, opacity).
- Domain merge and precedence:
  - Configured domain union across multiple members.
  - Data-derived domain union with no configured domain.
  - Behavior when no member provides a domain.
- Initial domain semantics:
  - Initial domain captured once, not drifting with data reconfigure.
  - Document intent: zoom should clamp when the original domain is fully visible.
  - Constant domain [0, 0] should be treated as initialized.
- Range handling:
  - Range expr refs update scale on param change.
  - Range listener cleanup when reconfiguring with new range.
  - Reverse range behavior consistent for discrete and continuous.
- Zoom/interaction:
  - ZoomTo with duration updates and final domain.
  - Zoom extent clamp behavior for locus and non-locus.
  - isZoomed correctly reflects non-initial domain.
- Locus conversions:
  - to/from chromosomal interval and scalar domain.

## Potential bugs and fragility points
- isZoomed returns true when domain equals initial domain, i.e., inverted logic.
- getDataDomain() reduces without an initial value and can throw on empty array.
- Range expr ref listeners are invalidated but not removed from the set,
  potentially leaking.
- Domain initialized check treats [0, 0] as uninitialized, which can be valid.
- "Initial domain" is recomputed from current inputs; this can drift with data
  changes, making zoom state ambiguous.
- applyLockedProperties forces unit ranges for positional channels even when
  user-specified ranges exist; unclear if intentional.

## Allowed semantic fixes (to document + test)
- Fix isZoomed logic to report zoomed state correctly.
- Make getDataDomain() safe when no members provide a domain.
- Treat [0, 0] as a valid initialized domain.
- Ensure range expr refs do not leak listeners on reconfigure.
- Make initial-domain behavior explicit and non-drifting for zoom clamp.

## Refactor sequence suggestion
1) Separate prop merging from domain/range handling (pure ScalePropsResolver).
2) Extract domain aggregation and initial-domain management to its own helper.
3) Extract scale creation/configuration and range handling to ScaleInstanceManager.
4) Move zoom/pan/transition into a controller with minimal dependencies.
5) Move locus-specific conversions and extents into scaleLocus if it fits.
6) Move default props + locked props into theme/config ownership.
7) Extract channel/type compatibility + locked rules into a ScaleRules module.

## Definition of done per step
- Each extraction step leaves ScaleResolution as wiring only for that concern.
- New modules have focused tests that cover the documented rules.
- Run the full Vitest suite (`npm test`).
- Make a commit for each step.
- Public `ScaleResolutionApi` behavior remains stable.
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
