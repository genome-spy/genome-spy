# Selection Expansion Plan

## Status

- Branch: `feature/selection-expansion`
- Last revised: 2026-02-25
- Document scope: design and implementation plan for point-selection expansion based on datum properties, with provenance-friendly intent actions.
- Implementation snapshot:
  - Complete: action contract/types, predicate utilities, provenance replay integration, provenance action-info rendering, shared expansion menu module, SampleView and App-level context-menu integration, core test coverage.
  - In progress: cleanup/refinement only.
  - Pending: documentation pass, optional operation modes (`add`/`remove`/`toggle`) runtime support, optional replay-drift diagnostics.

## Problem Summary

GenomeSpy currently supports interactive point and interval selections. For cohort-scale visualizations (for example structural variant arcs), users often need to expand a pointed item into a larger semantic subset:

- Example: user points one SV arc and wants to select all arcs with the same `clusterId`.
- Constraint: values like `clusterId` can be local to a scope (sample, patient, patient-timepoint, etc.), not globally unique.
- Requirement: expansion must be provenance-safe and bookmark-safe.

The existing context menu is available and can host a new top-level action. Existing parameter provenance capture (`paramChange`) is functional but too generic for intent-level semantics.

## Goals

1. Add a user-visible context menu entry for selection expansion when expansion is possible.
2. Keep expansion declarative via `LogicalComposition`-based predicates.
3. Route expansion through a dedicated intent action for clear provenance semantics.
4. Keep bookmark payloads compact enough for URL hash sharing while preserving semantic replay.
5. Support scope-safe expansion via configurable partition keys (not hardcoded to `sampleId`).
6. Design payloads and APIs so `add`/`remove`/`toggle` can be added without breaking changes.

## Non-Goals (Initial Iteration)

1. No free-form expression editor UI.
2. No full data catalog/type system redesign.
3. No automatic live query binding after action execution.
4. No broad schema redesign in `FieldDef` for non-visual semantics.

## Design Principles

1. Declarative first: represent expansion logic as structured predicates, not ad hoc callbacks.
2. Provenance first: use explicit intent actions, not only low-level param diffs.
3. Compact replay: persist intent semantics, not large materialized key sets.
4. Scope-aware defaults: prefer local identity scope by config.
5. Keep visual encoding schema clean: selection-expansion semantics should live with selection/action config, not generic visual channels.

## UX Design

## Entry Point

Current implementation adds one top-level item in both context-menu hosts:

- Label: `Select related items`
- Visible only when all are true:
  - A hover/pointed datum exists.
  - A target bookmarkable point selection parameter exists.
  - Target selection is multi-capable (`toggle: true` in selection config).
  - At least one expansion rule is applicable.
- Placement:
  - In SampleView, grouped under the hovered unit-view section header.
  - Outside SampleView, shown by App-level context-menu handler.
- Performance behavior:
  - Top-level context menu opens immediately.
  - Field extraction and heuristic work happen lazily when submenu is opened.

## Initial Menu Structure

Current submenu shape (3 levels):

1. `Select related items`
2. `Choose matching rule`
3. Rule item `<field> = <value>` -> operation submenu:
   - `In current <scope>`
   - `Across all <scopes>` (only when scoped mode is available)

Examples (generated at runtime, not hardcoded):

1. `clusterId = C42` -> `In current patient`
2. `Func = genic_other` -> `In current sample`
3. `eventClass = translocation` -> `Across all samples`

Label generation rules:

1. `fieldLabel` comes from configured rule label, then field title/alias, then raw field name.
2. `originValue` is formatted from pointed datum value (truncated if long).
3. `scopeLabel` comes from `partitionBy` config, for example `["patientId"]` -> `this patient`.
4. `scopeLabel` can also map `["sampleId"]` -> `this sample`.
5. `scopeLabel` falls back to `this scope` for multiple keys or unknown semantics.
6. If origin value is null/undefined, hide that rule by default unless explicitly configured.
7. If no human-friendly label is available, fallback to generic text.

Future submenu items:

1. `Add to selection`
2. `Remove from selection`
3. `Toggle in selection`

## Scope Messaging

Menu labels must make partitioning explicit and derive wording from configured partition keys.

- `in this patient`
- `in this sample`
- `in this scope`
- `across all`

This prevents ambiguity where IDs repeat across scopes.

## Predicate Model

## Logical Composition

Adopt Vega-Lite logical structure as canonical:

```ts
type LogicalComposition<T> = T | { not: LogicalComposition<T> } | { and: LogicalComposition<T>[] } | { or: LogicalComposition<T>[] };
```

## Leaf Predicate (Initial)

Start with a minimal leaf object shape that is easy to validate and serialize:

```ts
type SelectionLeafPredicate =
  | { field: string; op: "eq"; valueFromField: string }
  | { field: string; op: "eq"; value: string | number | boolean | null }
  | { field: string; op: "in"; values: (string | number | boolean | null)[] };
```

Notes:

- `valueFromField` supports "same as origin datum" patterns.
- Runtime normalizer resolves `valueFromField` against the origin datum before evaluation.
- Unknown operators fail fast.
- Leaf predicates must not define top-level `and`/`or`/`not`.

## Partitioning (Identity Scope)

Add optional `partitionBy: string[]` at rule/action level.

Runtime composes final predicate:

1. Base user predicate.
2. Conjunction of equality predicates for each partition field:
   - `partitionField == originDatum[partitionField]`.

This supports per-sample, per-patient, or custom scope keys.

## Where Config Lives

Do not overload `FieldDef` or visual channel semantics.

Recommended location:

- Selection config extension (for rules/default partition behavior), for example:
  - `select.expand.rules`
  - `select.expand.partitionBy`
- Or equivalent app-level config block tied to target selection param.

Reasoning:

- Expansion is interaction semantics, not mark encoding semantics.
- A field can have different visual types in different views, but expansion semantics should stay stable and explicit.

## Intent Action Design

## New Action Type

Add a dedicated action (in `paramProvenanceSlice` or adjacent param-intent slice):

```ts
type ExpandPointSelectionIntentV1 = {
  selector: ParamSelector;
  operation: "replace" | "add" | "remove" | "toggle";
  predicate: LogicalComposition<SelectionLeafPredicate>;
  partitionBy?: string[];
  origin?: {
    view: ViewSelector;
    keyField: string;
    key: string | number | boolean;
  };
  label?: string;
};
```

## Action Invariants

1. `operation` required even if UI only exposes `replace` initially.
2. `predicate` persisted for provenance readability and replay.
3. Payload must remain compact (no unbounded key arrays) for bookmark URL viability.
4. Payload remains JSON-serializable.

## Execution Flow

Current execution path:

1. Validate payload and resolve `selector`.
2. Resolve origin datum.
3. Normalize predicate (`valueFromField` to literal values).
4. Evaluate predicate against collector data.
5. Build runtime point selection from matched datums.
6. Store semantic expansion action in param-provenance entry.
7. Param bridge re-evaluates action and applies runtime param value.

Implementation note:

- Dispatch currently happens directly from menu callbacks via `IntentExecutor` to `expandPointSelection` action.
- A dedicated `IntentPipeline` hook remains an optional refactor, not a functional blocker.

## Provenance and Bookmarks

## Why Dedicated Intent Action

Current `paramChange` records resulting value but not "why". Expansion intent should be represented as first-class action to preserve semantics in history UI.

## Replay Strategy

Persist both:

1. Intent semantics (`predicate`, `operation`, `partitionBy`, `origin`).

Replay is semantic: evaluate the intent against current data at apply time.

If source data changes, replay may differ; this is acceptable in the initial compact-payload design.

Future extension idea:

1. Add optional drift diagnostics (`expectedMatchCount`, `sourceDataFingerprint`) to improve user warnings without storing large result sets.
2. Add `schemaVersion` when evolution pressure appears.

## Action Info

Extend action info formatting so history can show human-readable intent:

- `Expand selectedVariants by clusterId == 42 in patient P001`
- `Add 37 points to selectedVariants (same cluster in sample)`

## Data Type Handling Strategy

Initial field chooser heuristics:

1. Prefer string and boolean fields on origin datum.
2. Allow numeric fields only when low-cardinality heuristic passes.
3. Hide fields with `null`/`undefined` origin value by default (or show as advanced).

Optional overrides from config:

1. Explicit include/exclude field lists.
2. Explicit partition fields.
3. Optional label overrides for user-facing menu text.

## Step-by-Step Implementation Plan

### Phase 1: Types and Contracts (`Complete`)

Implemented:

1. Expansion payload and provenance value types in `packages/app/src/state/paramProvenanceTypes.d.ts`.
2. Dedicated `expandPointSelection` reducer action in `packages/app/src/state/paramProvenanceSlice.js`.
3. Grouping behavior for provenance coalescing (`expandPointSelection` does not coalesce with normal `paramChange`).

### Phase 2: Predicate Utilities (`Complete`)

Implemented in `packages/app/src/state/selectionExpansion.js`:

1. Logical composition helpers (`isLogicalAnd`, `isLogicalOr`, `isLogicalNot`).
2. Predicate normalization (`valueFromField` -> resolved literal values).
3. Partition predicate composition (`withPartitionBy`).
4. Predicate function creation with fail-fast validation/errors.

### Phase 3: Intent Pipeline Integration (`Partially Complete`)

Current:

1. Expansion actions are dispatched via `IntentExecutor` from menu callbacks.
2. Runtime application occurs in `ParamProvenanceBridge`.
3. `operation` field is future-ready in payload contract, but only `replace` is executed in runtime.

Remaining:

1. Optional refactor: route expansion through an explicit `IntentPipeline` hook for parity with metadata intent hooks.
2. Implement runtime semantics for `add`/`remove`/`toggle` operations.

### Phase 4: Provenance Reducer + Bridge (`Complete for v1`)

Implemented:

1. Reducer stores semantic expansion entries (`pointExpand` value type).
2. Bridge resolves origin datum, applies normalized + partitioned predicate, and writes multi-point selection runtime values.
3. Collector readiness handling and delayed reapply are in place.

### Phase 5: Action Info and UX Strings (`Complete for v1`)

Implemented:

1. `paramActionInfo` renders expansion-specific provenance labels.
2. Predicate labels use markup for field/operator/value.
3. Scope wording reflects partitioning (`current sample`, `current patient`, `current scope`, `across all`).

### Phase 6: Context Menu UI (`Complete for v1`)

Implemented:

1. SampleView integration with per-unit-view grouping and warning behavior when multiple eligible point params exist.
2. Lazy submenu construction and field-option extraction.
3. Rule-first submenu, then operation submenu (`replace`-based actions in v1).

### Phase 6b: App-Level Context Menu Outside SampleView (`Complete for v1`)

Implemented:

1. App-level contextmenu handler for non-SampleView contexts.
2. Uses same `resolveSelectionExpansionContext(...)` resolution logic.
3. Skips handling inside SampleView to avoid duplicate ownership.

### Code Reuse and Duplication Control (`Complete`)

Implemented:

1. Shared expansion menu builder in `selectionExpansionMenu.js`.
2. Shared context resolution and field-option logic in `selectionExpansionContext.js`.
3. Both SampleView and App-level wrappers dispatch identical `expandPointSelection` payloads.

### Phase 7: Tests (`Complete for v1 scope`)

Implemented coverage includes:

1. Predicate normalization and logical evaluation (`selectionExpansion.test.js`).
2. Context resolution and menu option generation (`selectionExpansionContext.test.js`, `selectionExpansionMenu.test.js`).
3. Reducer payload behavior (`paramProvenanceSlice.test.js`).
4. Bridge replay + partition behavior + failure paths (`paramProvenanceBridge.test.js`).
5. Provenance action-title formatting (`paramActionInfo.test.js`).

### Phase 8: Documentation (`Pending`)

Remaining:

1. User-facing docs for:
   - Expansion behavior.
   - Scope/partition semantics.
   - Example configurations.
2. Developer docs for payload contract and replay model.

## Risk Register and Mitigations

1. Risk: Ambiguous scoping for repeated IDs.
   - Mitigation: explicit `partitionBy`, clear UI labels.
2. Risk: Large data performance in predicate evaluation.
   - Mitigation: evaluate over collector once per action; no per-frame evaluation.
3. Risk: Replay drift if underlying data changes.
   - Mitigation: semantic replay in v1; consider optional diagnostics later if needed.
4. Risk: Missing `encoding.key` prevents robust persistence.
   - Mitigation: hide/disable expansion for non-bookmarkable targets or show explicit warning.

## Product Decisions (V1)

1. First release uses only a fixed "same field value" menu pattern.
2. Expansion target is a single multi-point selection param per UnitView.
3. If multiple eligible multi-point selection params are found in one UnitView, log a warning and disable expansion functionality for that view.
4. No pre-commit count preview for large matches in v1.
5. Keep v1 UI simple: expose replace behavior only.

## Testing and Commit Plan

Run all commands from repo root.

### Test Execution Plan

1. During implementation and refinements, run focused suites frequently:
   - `npx vitest run packages/app/src/state/selectionExpansion.test.js`
   - `npx vitest run packages/app/src/state/selectionExpansionContext.test.js`
   - `npx vitest run packages/app/src/state/selectionExpansionMenu.test.js`
   - `npx vitest run packages/app/src/state/paramProvenanceBridge.test.js`
   - `npx vitest run packages/app/src/state/paramActionInfo.test.js`
2. Before final commit, run workspace-level checks:
   - `npm -ws run test:tsc --if-present`
   - `npm run lint`
3. Before PR (or as final local validation), run full unit tests:
   - `npm test`

### Commit Plan

Already landed (feature branch):

1. Selection-expansion intent contract, predicate utilities, and provenance bridge integration.
2. Shared menu generation and context resolution.
3. SampleView and App-level context-menu integration.
4. Test coverage across reducer/bridge/context/menu/action-info modules.

Remaining commits:

1. Optional: `refactor(app): route selection expansion through intent pipeline hook`.
2. Optional: `feat(app): support add/remove/toggle expansion operations`.
3. `docs(app): document selection expansion behavior and constraints`.

## Acceptance Criteria (Initial Release)

1. User can right-click a datum and run one expansion action from context menu.
2. Expansion selects all matching points according to declarative predicate.
3. Partitioning works with arbitrary scope fields (not hardcoded to sample).
4. Provenance shows an explicit expansion action title.
5. Undo/redo works.
6. Bookmark payload size remains compact (no unbounded key tuple arrays) and URL-hash sharing remains practical.
7. Bookmark replay is semantic and compact; source-data drift is accepted in v1 (dedicated drift diagnostics are future work).
