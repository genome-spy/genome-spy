# Scale Domain Streamlining Plan

## Context

- Collector already caches data domains, so repeated domain reads should not re-scan raw data.
- When a configured domain exists, data-domain access is unnecessary and should be avoided entirely.
- Resolution type changes are effectively unsupported; assume type is stable per resolution.

## Concrete Plan

### Phase 1: Cache configured-domain union and short-circuit data domains

Rationale:
- Configured domains are static relative to data updates.
- Avoiding data-domain access when a configured domain exists removes unnecessary aggregation work.

Plan:
- Introduce a configured-domain cache in `ScaleDomainAggregator` (or `ScaleResolution`).
- Invalidate cache only on member add/remove or when a member’s `channelDef.scale.domain` changes.
- If configured domain exists, `getConfiguredOrDefaultDomain()` returns it directly (no data-domain lookup).

Tests:
- Update/extend existing scale resolution tests to ensure configured domains bypass data-domain aggregation.
- Verify that removing/adding members or changing configured domains invalidates the cache and recomputes.

Run tests after Phase 1:
- `npx vitest run`
- `npm -ws run test:tsc --if-present`

### Phase 2: Precompute data-domain accessor sets and restrict member scanning

Rationale:
- `getDataDomain()` currently re-discovers accessors on every call.
- Data-domain updates happen frequently; avoid repeated traversal over encoders and accessors.

Plan:
- Maintain a stable accessor collection per resolution, filtered to scale accessors and data-domain contributors.
- Track a data-domain-contributing member set separately (views that are not domain-inert and do contribute).
- Update these sets on member registration/unregistration and on encoder updates that affect accessors.

Tests:
- Add/adjust tests to confirm data-domain aggregation uses only contributing members.
- Add a test that a domain-inert subtree does not produce accessors for data-domain aggregation.

Run tests after Phase 2:
- `npx vitest run`
- `npm -ws run test:tsc --if-present`

### Phase 3: Split `reconfigureDomain` into explicit phases

Rationale:
- The current flow mixes collection, domain computation, scale mutation, and notifications.
- Explicit phases make it easier to short-circuit and verify correctness.

Plan:
- Refactor `reconfigureDomain` into explicit phases:
  1) resolve inputs (configured/domain cache + data-domain union),
  2) compute target domain (including defaults and locus behavior),
  3) apply and notify only if changed.
- Ensure Phase 1 feeds Phase 2 with cached configured domains when available.

Tests:
- Add tests ensuring that phase ordering does not regress zoom reset, configured domain, or data-domain behaviors.
- Add a test ensuring no domain notification when computed domain is unchanged.

Run tests after Phase 3:
- `npx vitest run`
- `npm -ws run test:tsc --if-present`

### Phase 4: Make `configureDomain` pure and enable early-out

Rationale:
- Current `configureDomain` mutates the scale and performs nicening internally.
- Early-out should compare against the *post-configured* target to avoid false positives due to nicening.

Plan:
- Refactor `configureDomain` to return a target domain (and any derived values) without mutating the scale.
- Use the returned target domain in `reconfigureDomain` Phase 3 to compare against the current scale domain.
- Only apply mutations when target differs, preserving nicening semantics without reimplementing D3 logic.

Tests:
- Add a test where `configureDomain` nicens the domain and verify that repeated reconfigure does not notify.
- Add a test to confirm that a change in data-domain that results in the same niced domain does not trigger updates.

Run tests after Phase 4:
- `npx vitest run`
- `npm -ws run test:tsc --if-present`

## Postponed / Investigate Further

### Batch domain refreshes per tick

Notes:
- Potentially useful, but ordering/timing concerns with microtasks vs render scheduling.
- Only pursue after confirming clear performance wins.

### Incremental per-domain-key aggregation

Notes:
- Collector domain caching makes raw access cheap; complexity may outweigh gains unless union/iteration dominates.

### Domain-key scoped invalidation

Notes:
- Typically only 1–3 domain keys per resolution; complexity may not be justified.

### Additional analysis questions

- How often do data-domain recomputations happen per frame under typical interactions?
  - Very rarely per frame; if anything happens per frame, it is usually zoom transition animation.
- Can multiple domain updates happen per frame?
  - Yes. Primary/secondary positional channels (e.g., x and x2) may notify separately, causing up to two updates per frame. Worth checking if collector notifications can be coalesced or if per-resolution debouncing is needed.
- How many accessors per resolution are common in real-world specs?
  - Typically 0–5 accessors per resolution, often 1–2.
- Does configured-domain usage cover a significant share of workflows?
  - Yes. Domains are often configured because they are more stable.
