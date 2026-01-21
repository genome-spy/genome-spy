# Domain Notification Refactor Plan

## Status

Baseline push-based domain updates are complete (collector cache + subscriptions, accessor domain keys, aggregator reads collectors, no `reconfigureScaleDomains`). The items below are optional follow-ups.

## Optional refinements

- [x] Should implement: Introduce a `ScaleAccessor` type that narrows `channelDef` to `ChannelDefWithScale` and requires `scaleChannel` + `domainKeyBase`. This removes casts in the aggregator/unit view and makes domain participation explicit at the type level. Update encoder/accessor typing so scale-bearing accessors are distinct from pure value accessors.
- [x] Should implement: Move subscription wiring into `ScaleResolution` (e.g., `registerCollector(collector, accessors)`), so UnitView only hands over encoders. This centralizes domain refresh behavior and reduces view-level plumbing, especially when collectors are shared.
- [x] Should implement: Extract a `DomainCache` helper owned by the collector with explicit `getDomain`, `clear`, and `notify` methods. This isolates cache invalidation logic and makes future optimizations (per-key invalidation, metrics) easier to test.
- [ ] Should implement: Add per-domain-key notifications to collectors instead of notifying all subscribers on every update. This would allow unrelated scales to avoid reconfigure calls when only specific domain keys change.
- [ ] Should implement: Batch `reconfigureDomain` calls per `ScaleResolution` (microtask or animation-frame queue). When multiple keys from the same collector update, a single refresh should cover them.
- [x] Should implement: Make domain key construction a single utility with explicit inputs (field/expr/datum/value, type, resolution channel). Document the expected key format and add a small unit-test matrix to prevent accidental key changes.
- [x] Should implement: Narrow internal typing for `contributesToScaleDomain` so it only exists on scale-bearing channel defs (or move it to a dedicated internal mixin). This avoids broad `ChannelDef` casts and clarifies intent.
- [x] Should implement: Add integration tests for shared collectors and conditional encodings, verifying that domain extraction occurs once per key and that subscriptions are disposed on view removal.
- [ ] Should implement: Add lightweight diagnostics (counters or optional logger hooks) for domain recomputation and subscription count. This helps spot leaks or excessive recomputation in large views.
- [ ] Should implement: Cache accessor-to-domainKey mapping per encoder instance to avoid repeated string building when domains refresh frequently.

## Key files for follow-ups

- `packages/core/src/data/collector.js`
- `packages/core/src/encoder/accessor.js`
- `packages/core/src/types/encoder.d.ts`
- `packages/core/src/scales/scaleDomainAggregator.js`
- `packages/core/src/scales/scaleResolution.js`
- `packages/core/src/view/unitView.js`
- `packages/core/src/view/view.js`
