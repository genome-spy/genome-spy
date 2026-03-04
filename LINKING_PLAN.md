# Linking Plan: Selection-Driven Domains and Brushing & Linking

## Status Snapshot

This branch now has **Phase 1 (one-way linking)** implemented and stabilized.

Completed commits:

1. `800451a2` — `feat(core): implement phase 1 one-way brushing and linked scale domains`
2. `5f8440bd` — `docs(core): simplify linked domain example structure`
3. `7460d53b` — `fix(core): reset linked domain when interval selection is cleared`
4. `395473ad` — `fix(core): skip zoomTo animation for linked interval domains`
5. `ff270698` — `fix(core): align linked selection domains with Vega-Lite`
6. `e178bb54` — `feat(core): support interval brush start via select.on`

## Scope and Key Decisions

1. Phase 1 first, then Phase 2.
2. Hierarchical params are required for cross-view linking (`push: "outer"` pattern).
3. Align with Vega-Lite where practical:
   - Selection-driven `scale.domain` supports `{ param, encoding?, sync? }`.
   - `empty` is not part of selection-driven `scale.domain`.
4. Keep two-way sync explicit opt-in via `sync: "twoWay"`.

## Implemented (Phase 1: One-Way Linking)

### Step 1: Selection domain reference type and schema

Status: Completed  
Commit: `800451a2`

Implemented:

1. Added `SelectionDomainRef` and enabled object refs in `scale.domain`.
2. Updated docs/schema-facing types in core spec files.

Preliminary commit message used:

1. `feat(core): add selection domain reference type for scale domains`

### Step 2: One-way domain resolution and param reactivity

Status: Completed  
Commit: `800451a2`

Implemented:

1. `DomainPlanner` resolves linked domains from interval params.
2. `ScaleResolution` subscribes to referenced params and reconfigures on change.
3. Linked domains support hierarchical pushed params for sibling linking.

Preliminary commit message used:

1. `feat(core): support one-way linking from interval selection params to scale domains`

### Step 3: Reconfigure behavior for linked domains

Status: Completed  
Commits: `7460d53b`, `395473ad`

Implemented:

1. Clearing interval selection restores data/default domain.
2. Linked-domain updates bypass zoom restore logic.
3. Linked-domain continuous updates bypass `zoomTo` animation path to avoid jank.

Preliminary commit message used:

1. `fix(core): preserve selection-linked domain updates on zoomable scales`

### Step 4: Tests for one-way linking

Status: Completed  
Commits: `800451a2`, `7460d53b`, `395473ad`, `ff270698`

Implemented:

1. Domain planner coverage for selection-linked domain resolution.
2. Scale resolution coverage for reactive updates and clear/reset behavior.
3. Regression tests for restore/animate conflicts in linked domains.

Preliminary commit message used:

1. `test(core): add one-way linked brushing tests with outer param push`

### Step 5: Docs and one-way example

Status: Completed  
Commits: `5f8440bd`, `ff270698`, `e178bb54`

Implemented:

1. Added and refined one-way example:
   `packages/core/examples/selection/interval_linked_domain.json`
2. Documented linking pattern with ancestor param + `push: "outer"`.
3. Updated example interaction to use `select.on: "mousedown"` (no Shift required).

Preliminary commit message used:

1. `docs(core): document one-way domain linking and hierarchical selection push`

## Vega-Lite Alignment Adjustments (Applied)

Status: Completed  
Commit: `ff270698`

Changes:

1. Removed `empty` from selection-driven scale domain API surface.
2. Retained empty-selection fallback behavior to normal data/default domain.
3. Kept enforcement schema-led (no extra runtime rejection logic).

## Remaining Work (Phase 2: Two-Way Linking)

Feasibility: **High**. Existing architecture already has the essential hooks:

1. Scale domain changes are observable (`ScaleInstanceManager` -> `domain` events).
2. Linked-domain refs already resolve param + encoding in `DomainPlanner`.
3. Param writes are synchronous and scoped (`ViewParamRuntime.setValue`).
4. App provenance already throttles selection changes (`ParamProvenanceBridge`).

Main implementation gaps are engineering-level (not architectural):

1. No runtime metadata API for active linked domain ref (`param`, `encoding`, `sync`).
2. No loop/source guards for domain->param->domain cycles.
3. No canonical domain-to-interval normalization utility for reverse sync.
4. No two-way docs/examples/tests yet.

### Step 6.1: Expose Linked-Domain Sync Metadata and Validation

Status: Pending

Goal:

1. Make two-way configuration queryable from `ScaleResolution` without re-parsing ad hoc.

Changes:

1. Extend `DomainPlanner` to expose resolved selection-domain link metadata:
   - `param`
   - resolved `encoding` (`x`/`y`)
   - `sync` (`"oneWay"` default)
2. Validate shared-scale compatibility for `sync` mode:
   - same `param` and `encoding` can share scale
   - conflicting `sync` values on same shared scale fail fast
3. Keep Vega-Lite-aligned domain-ref shape (`empty` not used here).

Likely files:

1. `packages/core/src/scales/domainPlanner.js`
2. `packages/core/src/scales/domainPlanner.test.js`

Pre-commit checks:

1. `npx vitest run packages/core/src/scales/domainPlanner.test.js`
2. `npx vitest run packages/core/src/scales/scaleResolution.test.js`
3. `npm -ws run test:tsc --if-present`

Preliminary commit message:

1. `feat(core): expose linked domain metadata for two-way sync`

### Step 6.2: Add Domain->Selection Reverse Sync in ScaleResolution

Status: Pending

Goal:

1. When `sync: "twoWay"` is set, scale domain interactions update the linked interval param.

Changes:

1. Add internal reverse-sync path in `ScaleResolution` triggered on domain change.
2. Resolve writable runtime for linked param and update only the referenced encoding interval.
3. Preserve non-target interval channels in the selection object.
4. Add loop guards:
   - guard writes originating from param-driven reconfigure
   - equality check before writing param
   - skip redundant writes when interval unchanged
5. Keep one-way behavior unchanged when `sync` is omitted or `"oneWay"`.

Likely files:

1. `packages/core/src/scales/scaleResolution.js`
2. `packages/core/src/scales/scaleResolution.test.js`

Pre-commit checks:

1. `npx vitest run packages/core/src/scales/scaleResolution.test.js`
2. `npm -ws run test:tsc --if-present`

Preliminary commit message:

1. `feat(core): sync linked interval params from scale domain changes`

### Step 6.3: Normalize Reverse-Synced Intervals and Clear Semantics

Status: Pending

Goal:

1. Make reverse-updated intervals stable and consistent with existing brush semantics.

Changes:

1. Normalize outgoing interval to canonical `[min, max]`.
2. Clamp to `zoomExtent`.
3. Apply type-specific normalization:
   - `index` / `locus`: integer-compatible rounding (match brush path semantics)
4. Clear semantics:
   - if domain matches the fallback/default extent for that linked scale, write `null`
     for that encoding interval to keep brush-cleared behavior consistent.
5. Add tiny helper(s) for interval equality and normalization to keep logic testable.

Likely files:

1. `packages/core/src/scales/scaleResolution.js`
2. `packages/core/src/scales/domainPlanner.js` (if default-domain helper exposure is needed)
3. `packages/core/src/scales/scaleResolution.test.js`

Pre-commit checks:

1. `npx vitest run packages/core/src/scales/scaleResolution.test.js`
2. `npx vitest run packages/core/src/scales/scaleInteractionController.test.js`
3. `npm -ws run test:tsc --if-present`

Preliminary commit message:

1. `fix(core): normalize and clear reverse-synced linked intervals`

### Step 7: Expand Test Coverage (Core + App Provenance)

Status: Pending

Goal:

1. Prove behavior is stable under interaction-heavy scenarios.

Changes:

1. Core tests (`scaleResolution.test.js`) for:
   - zoom/pan updates linked param with `sync: "twoWay"`
   - one-way mode remains unchanged
   - shared-scale sync conflict detection
   - no feedback oscillation on repeated domain updates
   - clear/reset mapping when domain returns to fallback extent
2. Add/extend interaction-controller-focused tests where needed for normalization edges.
3. App provenance tests (`paramProvenanceBridge.test.js`) for:
   - throttled provenance entries during continuous two-way zooming
   - no pathological action storms

Likely files:

1. `packages/core/src/scales/scaleResolution.test.js`
2. `packages/core/src/scales/scaleInteractionController.test.js` (if needed)
3. `packages/app/src/state/paramProvenanceBridge.test.js`

Pre-commit checks:

1. `npx vitest run packages/core/src/scales/scaleResolution.test.js`
2. `npx vitest run packages/core/src/scales/scaleInteractionController.test.js`
3. `npx vitest run packages/app/src/state/paramProvenanceBridge.test.js`
4. `npm -ws run test:tsc --if-present`

Preliminary commit message:

1. `test(app): cover two-way linked brushing provenance and throttled history`

### Step 8: Docs and Two-Way Example Finalization

Status: Pending

Goal:

1. Make two-way behavior discoverable and unambiguous to users.

Changes:

1. Update `docs/grammar/scale.md`:
   - document `sync: "twoWay"`
   - clarify one-way vs two-way behavior
   - document hierarchical param + `push: "outer"` requirement for sibling linking
2. Update `docs/grammar/parameters.md` where needed for interaction expectations.
3. Add a runnable two-way example under `packages/core/examples/selection/`
   showing:
   - ancestor param declaration
   - child brush `push: "outer"`
   - linked view with `scale.domain.sync: "twoWay"`
   - zoom/pan in linked view updates brush.

Likely files:

1. `docs/grammar/scale.md`
2. `docs/grammar/parameters.md`
3. `packages/core/examples/selection/` (new two-way example file)

Pre-commit checks:

1. Relevant docs/example validation command(s)
2. `npx vitest run` for changed tests
3. `npm -ws run test:tsc --if-present`

Preliminary commit message:

1. `docs(core): finalize two-way brushing and linking docs and example`

## Phase 2 Acceptance Criteria

1. With `sync: "twoWay"`, zoom/pan updates linked selection param.
2. Brush rect and linked domain stay synchronized in both directions.
3. No feedback loops, stable interaction feel, and acceptable provenance volume.
4. A runnable two-way linking example exists under `packages/core/examples/`.

## Validation Rule for Each Remaining Commit

Before each commit in Phase 2:

1. Run relevant focused Vitest suites for touched files.
2. Run `npm -ws run test:tsc --if-present`.
