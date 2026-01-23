# Scale Resolution Simplification Plan

## Context

- Collector already caches data domains, so repeated domain reads should not re-scan raw data.
- When a configured domain exists, data-domain access is unnecessary and should be avoided entirely.
- Resolution type changes are effectively unsupported; assume type is stable per resolution.
- Data-domain updates should stay lightweight: avoid repeated traversal and unnecessary scale mutation on each notification.

## Current Concerns (ScaleResolution + Helpers)

1) Resolution membership and rules
- Shared/independent/forced/excluded resolution logic
- Member registration/unregistration and visibility gating

2) Scale property aggregation
- Merging scale props across members
- Handling channel resolution overrides and scale name uniqueness

3) Domain computation and caching
- Configured domain union
- Data-domain union
- Defaults for locus and empty domains
- Categorical indexer stability
- Domain key and collector subscription wiring
- Data-domain updates should remain cheap (cached, minimal traversal, no redundant notifications).

4) Scale instance lifecycle
- Create scale, reconfigure props, reconfigure domain
- Domain/range notification suppression and manual notification

5) Interaction and zoom
- Zoom/pan/reset/zoomTo coordination
- Initial domain snapshots and zoom extent logic

6) Rendering integration
- Range texture updates on domain/range changes
- Axis length/coords usage for positional channels

7) Locus-specific conversions
- Complex interval conversions
- Genome extent and scale genome bindings

8) Diagnostics and edge cases
- Domain implicit/unknown handling for ordinal scales
- Nice/zero/padding interactions
- Log domain warnings

## Simplification Approach (High-Level)

- Separate "resolution wiring" from "scale engine": keep ScaleResolution minimal and push the heavy state machine into a dedicated engine.
- Make domain/props computation a pure pipeline (inputs -> outputs) with explicit state objects.
- Treat interaction (zoom/pan) as a plug-in with a narrow interface.
- Consider an optional rewrite of `scale.js` to make scale configuration pure and explicit (backed by tests).

## Incremental Plan

### Phase 1: Extract a ScaleState pipeline

Rationale:
- Make "compute domain/props" a pure step to reduce side effects and branching in ScaleResolution.

Plan:
- Introduce a `ScaleState` (or similar) object returned by a pure `computeScaleState(...)` helper.
- Inputs: resolved members, scale props, configured/data domains, type, and interaction flags.
- Outputs: target domain, domain metadata (ordinal unknown), categorical indexer updates, and any warnings.
- ScaleResolution uses the returned state to apply changes, notify, and update interaction controller.

Tests:
- Add unit tests for `computeScaleState` with controlled inputs.
- Ensure existing ScaleResolution tests still pass (behavior unchanged).

Run tests after Phase 1:
- `npx vitest run`
- `npm -ws run test:tsc --if-present`

### Phase 2: Formalize the DomainPlanner module

Rationale:
- Domain computation is currently split across ScaleResolution, ScaleDomainAggregator, and scale.js.
- A single planner can own domain caches and return a stable, minimal output.

Plan:
- Create a `DomainPlanner` that:
  - owns configured and data-domain caches,
  - provides `getConfiguredDomain()` / `getDataDomain()` / `getFinalDomain()`,
  - exposes invalidation hooks for membership/spec changes.
- Move ScaleDomainAggregator logic into DomainPlanner (or make it a thin wrapper around it).
- ScaleResolution only calls DomainPlanner and never touches raw members/accessors directly.

Tests:
- Move/duplicate ScaleDomainAggregator tests to the new module.
- Add tests for configured-domain short-circuiting and invalidation.

Run tests after Phase 2:
- `npx vitest run`
- `npm -ws run test:tsc --if-present`

### Phase 3: Split interaction into a plug-in

Rationale:
- Interaction logic is orthogonal to domain resolution and clutters ScaleResolution.

Plan:
- Define a minimal interface that ScaleResolution uses:
  - `getDomain()`, `setDomain(domain)`, `isZoomable()`, `onDomainApplied(...)`.
- Move zoom/pan/zoomTo/reset logic behind this interface.
- ScaleResolution only asks the plug-in to react to domain changes.

Tests:
- Keep existing interaction tests but route through the plug-in.
- Add a small contract test for the plug-in interface.

Run tests after Phase 3:
- `npx vitest run`
- `npm -ws run test:tsc --if-present`

### Phase 4: Optional rewrite of `scale.js`

Rationale:
- `scale.js` mixes spec-level logic with D3 mutability, which complicates reasoning.
- It already has solid tests, making a rewrite safer.

Plan:
- Define a pure `computeScaleConfig` that returns:
  - domain, domain metadata, range configuration, and warnings.
- Apply the configuration in a small, explicit mutator that touches the D3 scale.
- Keep the D3-specific logic isolated; use the pure function in tests.
- Ensure scale.copy() behavior (especially for locus scales) is explicitly covered.

Tests:
- Reuse existing `scale.test.js` and add new pure-config tests.
- Ensure locus scale behavior remains intact (scaleLocus copy/genome binding).

Run tests after Phase 4:
- `npx vitest run`
- `npm -ws run test:tsc --if-present`

## Postponed / Investigate Further

- Full API rewrite for ScaleResolution (public interface changes).
- Per-domain-key invalidation (likely low ROI due to small key counts).
- Per-tick batching (if perf data indicates multiple updates per frame).

## Additional Notes

- Accessor counts are typically small (0-5), and data-domain recomputes are rarely per-frame.
- Configured domains are common, so short-circuit paths should remain the fast path.
