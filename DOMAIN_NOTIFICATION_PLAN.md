# Domain Notification Refactor Plan

## Goal
Remove the pull-based `reconfigureScaleDomains` helper by pushing domain updates directly from collectors to the affected `ScaleResolution` instances. The collector should own domain caching and notify subscribers when its data changes, using an observe/subscribe pattern that returns an unregister callback.

## Current pain points
- Domain refresh relies on `reconfigureScaleDomains(view)`, which walks the view tree and reconfigures more than needed.
- Domain extraction re-iterates data per view/channel even when collectors are shared.
- The call site must remember to reconfigure domains after data changes.
- Axis/selection views currently rely on a view-level `contributesToScaleDomain` flag, which is implicit and leaky.

## Proposed architecture (push-based)
### 1) Collector owns domain cache and subscriptions
- Add a `DomainCache` in the collector, keyed by a stable **domain key** derived from channel definitions (not accessor identity).
- Provide a subscription API:
  - `subscribeDomainChanges(domainKey, callback) => () => void` (returns unregister)
- On data updates (load, repropagate, reset), the collector:
  - clears cached domains
  - notifies all subscribers (or only those whose key was requested)

### 2) Domain key definition (stable, not accessor identity)
- Attach a `domainKey` (or `domainKeyBase`) to accessors when they are created,
  derived from the channelDef. Finalize with the resolved type when needed.
- Use channel definition inputs to compute a stable key:
  - `type` (nominal/quantitative/ordinal)
  - `field` or `expr` (string) if present
  - `scaleChannel` / `channel` only if disambiguation is necessary
- Example key format:
  - `type + "|" + field + "|" + expr + "|" + scaleChannel`
- Rationale:
  - Avoids relying on accessor identity (not guaranteed shared)
  - Keeps expr-based domains distinct from field-based ones
  - Supports the rare case of the same field used with different types

### 3) UnitView integration
- When building encoders for a channel, use `accessor.domainKey` (or finalize
  `domainKeyBase` with resolved type).
- Register domain subscriptions with the collector:
  - `collector.subscribeDomainChanges(domainKey, () => scaleResolution.reconfigureDomain())`
- Store the unregister callback via `registerDisposer` so view disposal cleans up subscriptions.

### 4) Explicit non-contributing members
- Add `contributesToDomain: boolean` to `ScaleResolutionMember` (default true).
- AxisView and selection/interaction views register with `contributesToDomain: false`.
- `ScaleDomainAggregator` filters on `contributesToDomain` instead of view-level flags.
- This replaces the `contributesToScaleDomain` view option and makes intent explicit.

### 5) ScaleResolution changes
- Keep `reconfigureDomain()` as the entry point for data-driven domain updates.
- Remove `reconfigureScaleDomains` and its call sites (`flowInit`, `singleAxisLazySource`).
- Ensure `reconfigure()` remains reserved for membership/property changes.

### 6) Collector domain cache usage (no UnitView domain loop)
- Move domain extraction into Collector (or a helper it owns).
- `ScaleDomainAggregator` should query Collector for domains directly; remove the
  circular `ScaleResolution -> UnitView.extractDataDomain -> Collector` path.
- Keep `UnitView.extractDataDomain` only as a thin wrapper if needed for legacy call
  sites; otherwise remove it to avoid asymmetry.

## Rewiring checklist
- Add subscription API to collector and store subscribers by domain key.
- Hook collector lifecycle events to clear cache + notify subscribers.
- Attach domain keys to accessors at creation time.
- Register/unregister domain subscriptions via `registerDisposer`.
- Add `contributesToDomain` to ScaleResolutionMember and filter in ScaleDomainAggregator.
- Update AxisView/selection views to register as non-contributors.
- Remove `reconfigureScaleDomains` and update call sites.
- Move domain extraction into Collector and update domain queries.

## Performance considerations
- Avoid per-frame allocations: reuse cache maps, avoid recreating arrays in hot paths.
- Notify subscribers once per data update, not per tuple.
- Domain cache should be per collector (shared across views), so shared collectors compute once.
- Consider batching notifications if multiple domain keys map to the same resolution.

## Testing plan
### Unit tests
- Collector:
  - cache returns same domain without re-iterating
  - cache is cleared on data update
  - subscriptions notify exactly once per update
  - unregister removes callback
- UnitView / accessor wiring:
  - domainKey computed from channelDef/expr and finalized with type
- ScaleResolution/ScaleDomainAggregator:
  - non-contributing members do not affect data domains
  - `reconfigureDomain` is called on collector notifications
  - no use of `reconfigureScaleDomains` remains

### Integration tests
- Shared collector across multiple UnitViews:
  - domain extraction runs once, multiple scales update correctly
- Data update triggers domain change without manual reconfigure calls

## Indexer considerations
- Probably no special treatment. Domain keys are driven by channelDefs and type.
- If indexer-based scales expose fields differently, ensure the domain key still resolves correctly (field + type should be enough).

## Risk mitigation
- Introduce domain key helper in one place (avoid ad hoc keys).
- Keep `reconfigureDomain` behavior unchanged to limit regressions.
- Add tests before removing `reconfigureScaleDomains` call sites.
- Feature-flag the new collector subscription path if needed for staged rollout.
- Ensure subscriptions are disposed to prevent leaks (use `registerDisposer`).

## Relevant files
- `packages/core/src/data/collector.js`
- `packages/core/src/data/flowInit.js`
- `packages/core/src/data/flowBuilder.js`
- `packages/core/src/data/sources/lazy/singleAxisLazySource.js`
- `packages/core/src/encoder/accessor.js`
- `packages/core/src/encoder/encoder.js`
- `packages/core/src/genome/scaleLocus.js`
- `packages/core/src/scales/scaleDomainAggregator.js`
- `packages/core/src/scales/scaleResolution.js`
- `packages/core/src/view/unitView.js`
- `packages/core/src/view/axisView.js`
- `packages/core/src/view/view.js`
- `packages/core/src/view/viewUtils.js`
