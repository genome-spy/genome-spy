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

## Proposed split
1) ScalePropsResolver
   - Inputs: channel, data type, member channelDefs.
   - Output: merged props with defaults, configured domain, locked properties.
   - Knows about default scale type per channel.

2) ScaleInstanceManager
   - Owns the Vega scale instance creation/configuration.
   - Applies range, handles expr-ref ranges, annotates props.
   - Provides reconfigure() with no interaction logic.

3) ScaleDomainAggregator
   - Collects configured and data-driven domains across members.
   - Owns domain merging logic and initial-domain semantics.
   - Should be explicit about "initial" vs "current" domain.

4) ScaleInteractionController
   - Owns zoom/pan, zoom extent, zoom state, transitions, listeners.
   - Takes a scale instance and a domain provider.

5) LocusScaleAdapter (or move into scaleLocus)
   - Handles to/from complex locus conversions.
   - Handles genome extent and chromosomal intervals.

## Tests to add or move
- Domain merge and precedence:
  - Configured domain union across multiple members.
  - Data-derived domain union with no configured domain.
  - Behavior when no member provides a domain.
- Initial domain semantics:
  - Initial domain captured once, not drifting with data reconfigure.
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

## Refactor sequence suggestion
1) Extract domain aggregation and initial-domain management to its own helper.
2) Extract scale creation/configuration and range handling to ScaleInstanceManager.
3) Move zoom/pan/transition into a controller with minimal dependencies.
4) Move locus-specific conversions and extents into a dedicated adapter.
5) Re-evaluate default props and locked props ownership (theme vs resolver).

## Goals
- Reduce cross-cutting responsibilities in a single class.
- Make domain and zoom behavior explicit and testable.
- Clarify locus/index behavior boundaries.
- Improve maintainability without changing external behavior by default.
