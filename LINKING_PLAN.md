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

### Step 6: Implement two-way sync path with loop guards

Status: Pending

Planned changes:

1. Enable reverse sync only when `scale.domain.sync === "twoWay"`.
2. On scale `domain` events, write interval updates back to linked param.
3. Preserve non-target channels in the selection object.
4. Add source guards and equality checks to avoid oscillation loops.
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

Status: Pending

Planned changes:

1. Core tests for zoom/pan -> selection sync behavior.
2. Loop-prevention tests (no feedback oscillation).
3. App provenance tests to verify throttled action behavior under continuous zoom.

Pre-commit checks:

1. Relevant core Vitest files for two-way linking
2. `npx vitest run packages/app/src/state/paramProvenanceBridge.test.js`
3. `npm -ws run test:tsc --if-present`

Preliminary commit message:

1. `test(app): cover two-way linked brushing provenance and throttled history`

### Step 8: Final docs/examples pass for two-way mode

Status: Pending

Planned changes:

1. Add two-way examples and caveats to scale docs.
2. Keep terminology consistent across scale/parameter docs.
3. Add or extend example under `packages/core/examples/` using
   `sync: "twoWay"` and hierarchical params.

Pre-commit checks:

1. Relevant docs/example validation command(s)
2. `npx vitest run` for changed tests
3. `npm -ws run test:tsc --if-present`

Preliminary commit message:

1. `docs(core): finalize brushing-and-linking examples for one-way and two-way`

## Phase 2 Acceptance Criteria

1. With `sync: "twoWay"`, zoom/pan updates linked selection param.
2. Brush rect and linked domain stay synchronized in both directions.
3. No feedback loops, stable interaction feel, and acceptable provenance volume.
4. A runnable two-way linking example exists under `packages/core/examples/`.

## Validation Rule for Each Remaining Commit

Before each commit in Phase 2:

1. Run relevant focused Vitest suites for touched files.
2. Run `npm -ws run test:tsc --if-present`.
