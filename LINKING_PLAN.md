# Linking Plan: Selection-Driven Domains and Brushing & Linking

## Summary

Implement scale-domain linking to interval selection parameters in two phases:

1. **One-way linking**: interval selection param -> scale domain
2. **Two-way linking**: scale zoom/pan -> interval selection param (bi-directional)

This plan follows GenomeSpy's hierarchical params model: for cross-view linking,
the linked param must exist in an upper scope, and selection updates must be
`push`ed there from child views.

## Why This Is Needed

GenomeSpy interval selections currently drive filters and conditional encodings,
but not scale domains. Brushing and linking workflows need:

- A brush in one view that controls the domain of another view.
- Optional bi-directional behavior where zoom/pan in the linked view updates
  the brush param.

## Current State (Relevant Code)

- Configured domains are resolved from literal `scale.domain` only:
  `packages/core/src/scales/domainPlanner.js`
- Interval selection interaction updates params from brush gestures:
  `packages/core/src/view/gridView/gridChild.js`
- Scale domain changes already emit `domain` events:
  `packages/core/src/scales/scaleInstanceManager.js`
- Zoom/pan is applied through `ScaleResolution.zoom(...)`:
  `packages/core/src/view/gridView/gridView.js`
- Provenance already throttles selection-param updates (important for two-way):
  `packages/app/src/state/paramProvenanceBridge.js`
- Hierarchical param push semantics:
  `packages/core/src/paramRuntime/viewParamRuntime.js`

## Constraints and Decisions

1. **Phased delivery**
   - Phase 1 ships one-way linking first.
   - Phase 2 adds two-way linking after Phase 1 is stable.
2. **Hierarchical params**
   - Cross-view linking must use an ancestor param.
   - Child selection params must use `push: "outer"` to write to that ancestor.
3. **Fail-fast behavior**
   - Invalid refs, wrong param types, or ambiguous merged-domain refs throw
     explicit errors.

## Public API / Spec Changes

### 1) `scale.domain` selection reference

Extend `scale.domain` to support an object reference in addition to literal
scalar/complex arrays.

Planned shape:

```ts
type SelectionDomainRef = {
    param: string;
    encoding?: "x" | "y";
    empty?: "all" | "none";
    sync?: "oneWay" | "twoWay";
};
```

Planned union update:

```ts
domain?: ScalarDomain | ComplexDomain | SelectionDomainRef;
```

Notes:

- `encoding` is required when it cannot be inferred safely.
- `sync` defaults to `"oneWay"` in Phase 1 and remains explicit for two-way.
- `empty` default is `"all"` (fallback to configured/data/default domain).

### 2) Docs updates

- `docs/grammar/scale.md`: new selection-driven domain section with one-way and
  two-way examples.
- `docs/grammar/parameters.md`: explicit hierarchical linking pattern using
  ancestor param + `push: "outer"`.
- Optional mention in `docs/grammar/transform/filter.md` for shared brush param
  patterns.
- Add runnable linking example(s) under `packages/core/examples/` that
  demonstrate:
  - one-way linked brushing with `push: "outer"`,
  - two-way linked brushing with `sync: "twoWay"` (Phase 2).

## Hierarchical Param Pattern (Required for Cross-View Linking)

Use this pattern when brush and linked scale are in different scopes:

1. Define a writable param in an ancestor scope (no `select`).
2. In the brushing child view, define a selection param with the same `name`
   and `push: "outer"`.
3. Reference the ancestor param from linked view scale domain.

Example sketch:

```json
{
  "params": [{ "name": "brush" }],
  "hconcat": [
    {
      "params": [
        {
          "name": "brush",
          "select": { "type": "interval", "encodings": ["x"] },
          "push": "outer"
        }
      ],
      "mark": "point",
      "encoding": { "x": { "field": "x", "type": "quantitative" } }
    },
    {
      "mark": "point",
      "encoding": {
        "x": {
          "field": "x",
          "type": "quantitative",
          "scale": { "domain": { "param": "brush", "encoding": "x" } }
        }
      }
    }
  ]
}
```

## Implementation Plan

Every implementation commit below must run:

1. Relevant focused Vitest suites for files changed in that step.
2. `npm -ws run test:tsc --if-present` before commit.

## Phase 1: One-Way Linking (Selection -> Domain)

### Step 1: Add `scale.domain` selection-ref type + schema

Changes:

1. Add `SelectionDomainRef` in `packages/core/src/spec/scale.d.ts`.
2. Extend `Scale.domain` union to include selection-domain refs.
3. Regenerate schema/docs artifacts if required by docs macros.

Pre-commit checks:

1. `npx vitest run packages/core/src/scales/domainPlanner.test.js`
2. `npm -ws run test:tsc --if-present`

Preliminary commit message:

1. `feat(core): add selection domain reference type for scale domains`

### Step 2: Implement one-way domain resolution + reactivity

Changes:

1. Extend `DomainPlanner` configured-domain resolution for:
   - literal domains (existing behavior),
   - selection-domain refs.
2. Resolve refs via `member.view.paramRuntime.findValue(param)`.
3. Validate param existence/type/channel compatibility.
4. Convert intervals through existing complex conversion (`fromComplexInterval`)
   where applicable.
5. Add empty selection semantics:
   - `empty: "all"` -> fallback to default/data domain.
   - `empty: "none"` -> empty domain.
6. Add ref-aware subscriptions in `ScaleResolution` so param changes trigger
   `reconfigureDomain()`.
7. Keep subscriptions lifecycle-owned by existing disposers.

Pre-commit checks:

1. `npx vitest run packages/core/src/scales/domainPlanner.test.js`
2. `npx vitest run packages/core/src/scales/scaleResolution.test.js`
3. `npm -ws run test:tsc --if-present`

Preliminary commit message:

1. `feat(core): support one-way linking from interval selection params to scale domains`

### Step 3: Handle zoom-preservation conflict for linked domains

Changes:

1. Introduce an internal linked-domain mode signal in scale state.
2. In `ScaleResolution.#finalizeReconfigure`, bypass `"restore"` behavior for
   linked domains so param-driven updates are not reverted.

Pre-commit checks:

1. `npx vitest run packages/core/src/scales/scaleResolution.test.js`
2. `npm -ws run test:tsc --if-present`

Preliminary commit message:

1. `fix(core): preserve selection-linked domain updates on zoomable scales`

### Step 4: Add one-way tests including hierarchical `push: "outer"` pattern

Changes:

1. Add/extend tests in `domainPlanner.test.js`:
   - linked interval resolution,
   - empty semantics,
   - index/locus conversion.
2. Add/extend tests in `scaleResolution.test.js`:
   - param change reconfigure,
   - no restore regression,
   - no-op behavior.
3. Add integration coverage for cross-view linking via ancestor param and
   child selection param with `push: "outer"`.

Pre-commit checks:

1. New/updated focused Vitest files for linking integration
2. `npx vitest run packages/core/src/scales/scaleResolution.test.js`
3. `npm -ws run test:tsc --if-present`

Preliminary commit message:

1. `test(core): add one-way linked brushing tests with outer param push`

### Step 5: Document one-way linking and hierarchical param setup

Changes:

1. Update `docs/grammar/scale.md` with one-way domain-linking examples.
2. Update `docs/grammar/parameters.md` with ancestor-param + `push: "outer"`
   cross-view pattern.
3. Optionally add brief pointer in `docs/grammar/transform/filter.md`.
4. Add a core example in `packages/core/examples/` for one-way linking.

Pre-commit checks:

1. Relevant docs validation/build command(s) used in this repo
2. `npm -ws run test:tsc --if-present`

Preliminary commit message:

1. `docs(core): document one-way domain linking and hierarchical selection push`

Phase 1 acceptance criteria:

1. A brush interval selection can drive another view's scale domain.
2. Cross-view linking works with ancestor param + `push: "outer"` pattern.
3. Linked domains react to param changes without being reverted by zoom
   preservation logic.
4. A runnable one-way linking example exists under `packages/core/examples/`.

## Phase 2: Two-Way Linking (Domain -> Selection)

### Step 6: Implement two-way sync path with loop guards

Changes:

1. Enable reverse sync only when `scale.domain.sync === "twoWay"`.
2. On scale `domain` events, write interval updates back to linked param.
3. Preserve non-target channels in the selection object.
4. Add source guards and equality checks to prevent oscillation loops.
5. Normalize reverse-updated intervals:
   - canonical ordering `[min, max]`,
   - index/locus-compatible rounding,
   - clamp to zoom extent.

Pre-commit checks:

1. `npx vitest run packages/core/src/scales/scaleResolution.test.js`
2. `npx vitest run packages/core/src/scales/scaleInteractionController.test.js`
3. `npm -ws run test:tsc --if-present`

Preliminary commit message:

1. `feat(core): add two-way sync between zoomable domains and interval selections`

### Step 7: Add two-way tests and app provenance coverage

Changes:

1. Add core tests for wheel/pan/keyboard zoom -> selection sync behavior.
2. Add loop-prevention tests (no oscillation).
3. Add/extend app provenance tests to verify throttled action behavior under
   continuous zooming.

Pre-commit checks:

1. Relevant core Vitest files for two-way linking
2. `npx vitest run packages/app/src/state/paramProvenanceBridge.test.js`
3. `npm -ws run test:tsc --if-present`

Preliminary commit message:

1. `test(app): cover two-way linked brushing provenance and throttled history`

### Step 8: Final docs/examples pass for two-way mode

Changes:

1. Finalize scale docs with two-way mode examples and caveats.
2. Ensure terminology consistency between scale and parameter docs.
3. Adjust examples for clarity of hierarchical params and `push: "outer"`.
4. Add or extend a core example in `packages/core/examples/` for two-way
   linking mode (`sync: "twoWay"`).

Pre-commit checks:

1. Relevant docs/example validation command(s)
2. `npx vitest run` for any changed tests
3. `npm -ws run test:tsc --if-present`

Preliminary commit message:

1. `docs(core): finalize brushing-and-linking examples for one-way and two-way`

Phase 2 acceptance criteria:

1. With `sync: "twoWay"`, zoom/pan updates linked selection param.
2. Brush rect and linked domain stay synchronized both directions.
3. No feedback loops, no excessive provenance spam, and stable performance.
4. A runnable two-way linking example exists under `packages/core/examples/`.

## Rollout and Risk Mitigation

1. Land Phase 1 first and keep behavior stable before reverse sync.
2. Keep two-way behavior explicit opt-in (`sync: "twoWay"`), not default.
3. Keep fail-fast validation for missing/mismatched params and ambiguous refs.
4. Keep hierarchical param requirement visible in docs and examples.
