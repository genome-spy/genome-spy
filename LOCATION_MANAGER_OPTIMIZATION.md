# LocationManager Optimization Plan

## Rationale / Current Problems

LocationManager currently produces a flexible layout (bird’s‑eye ↔ closeup) but the
implementation is expensive under smooth scrolling and large sample counts
(5,000+). The main problems are:

- Per-frame object churn from `LocSize` wrappers and arrays. Getter-based
  wrappers (`interpolateLocSizes`, `translateLocSize`) create nested objects and
  closures whose getters are called repeatedly across render layers.
- Redundant work across layers. The same locations are consumed by multiple
  view layers (background, grid, view, summaries), each iterating through large
  sample arrays.
- O(N) texture updates each frame. `updateFacetTexture()` rebuilds data and
  uploads a texture even when Y layout did not change (e.g., panning on X).
- Layout recalculation is coupled to rendering. The layout is cached, but it is
  invalidated by layout events; scrolling and peek transitions still trigger
  per-frame work through getters and repeated access.
- Test coverage for layout behavior is limited, which makes aggressive
  refactoring risky.

## Successful Outcome

A successful outcome means:

- Smooth scrolling with thousands of samples on typical hardware (no stutters
  from GC or hot-path allocations).
- No change in visible behavior: same positions, spacing, peek transitions,
  and scrolling semantics as today.
- Reduced per-frame CPU cost (fewer closures, fewer allocations, fewer
  per-sample loops).
- Clear separation between structural layout (rare) and dynamic updates
  (scroll/peek, frequent).
- LocationManager is testable with unit tests that validate layout invariants
  and interpolation behavior.

## Proposed Optimization Ideas (Not all must be implemented)

### Low-risk, high impact
- Introduce dirty flags or a layout version counter so that expensive work
  (layout rebuilds, facet texture updates) runs only when inputs change.
- Cache and reuse arrays and objects. Avoid `map(...).forEach(...)` patterns
  that allocate a new `LocSize` or wrapper per sample each frame.
- Gate `updateFacetTexture()` on Y-layout changes only.

### Medium-risk
- Replace getter-based `LocSize` wrappers with explicit refresh steps that
  compute numeric arrays once per update.
- Switch to struct-of-arrays for samples: `locs[]`, `sizes[]`, `keys[]` (and
  similar for summaries/groups). This eliminates per-sample object allocation
  in hot paths.
- Add visible-range culling for samples. Even simple Y-range culling reduces
  work to O(visible) for render loops and texture updates.

### Higher risk / future ideas (not required now)
- Shader-side interpolation and scroll (GPU-driven layout).
- Instanced rendering or multi-draw (planned with WebGPU migration).

## Incremental Refactor Plan

1) **Baseline & profiling hooks**
   - Add a minimal benchmarking view/spec (or local profiling notes) that
     captures frame time and GC behavior for 5k+ samples with scroll + peek.
   - Identify a few representative scenarios: idle, scroll-only, peek-only,
     and scroll+peek.

2) **Testability improvements (small, safe changes)**
   - Export pure helpers like `calculateLocations` (or equivalent) and add
     unit tests for layout invariants and interpolation correctness.
   - Add tests for `computeScrollMetrics` and `getSampleLocationAt`.
   - After this phase: run `npx vitest run` and `npm -ws run test:tsc --if-present`,
     then **pause for manual testing** to confirm behavior is unchanged before
     continuing.

3) **Separate structural vs dynamic layout updates**
   - Introduce explicit “structural” rebuild (on hierarchy/size changes) and
     “dynamic” updates (on scroll/peek changes).
   - Add a layout version/dirty flag to avoid recomputation when inputs are
     unchanged.

4) **Replace getter-based LocSize wrappers (hot path)**
   - Compute interpolated locations explicitly in a refresh step.
   - Keep the public API stable initially; internal storage can move to numeric
     arrays while still exposing a compatible shape.
   - After this phase: run `npx vitest run` and `npm -ws run test:tsc --if-present`,
     then **pause for evaluation** of the core optimized calculation logic.

5) **Reduce per-frame allocations in rendering**
   - Reuse `sampleOptions` (or equivalent) arrays in `SampleView`.
   - Avoid per-sample `scaleLocSize` wrappers; precompute scale factor once
     and apply during refresh.

6) **Facet texture update gating**
   - Track when Y layout changes and only then rebuild and upload the facet
     texture.
   - Ensure scrolling on X does not trigger texture work.

7) **Optional: visible-range culling**
   - Compute visible sample range and render only those samples. This is
     especially beneficial for large N and narrow viewports.
   - Keep summaries/groups unchanged; their counts are small.

8) **API cleanup (if needed)**
   - If a new layout snapshot format is adopted, update consumers to use it
     directly. Keep compatibility shims if necessary.

9) **Regression tests and validation**
   - Extend tests to cover peek transitions (state 0, mid, 1) and scroll
     semantics (offset applied only in closeup).
   - Verify layout equality against the current implementation for fixed
     inputs.

10) **Performance validation**
   - Re-run baseline scenarios and document improvements (frame time,
     allocations, GC frequency).

## Notes

- The counts of groups/summaries are small; optimizations should focus on the
  sample path.
- The refactor may change internal APIs, but the visual output must remain
  identical.
- Test coverage is a prerequisite for more invasive changes.
- After each phase, run tests (`npx vitest run` and
  `npm -ws run test:tsc --if-present`) and commit the changes.
- The current logic is sophisticated; refactors should prioritize clarity for
  human readers and LLMs (clear naming, explicit phases, and concise inline
  documentation where needed).
