# Selection Expansion Plan

## Status

- Branch: `feature/selection-expansion`
- Document scope: design and implementation plan for point-selection expansion based on datum properties, with provenance-friendly intent actions.

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

Add one new top-level context menu item in SampleView context menu:

- Label: `Expand Selection...`
- Visible only when all are true:
  - A hover/pointed datum exists.
  - A target bookmarkable point selection parameter exists.
  - Target selection is multi-capable (`toggle: true` in selection config).
  - Data collector is complete for target view.
  - At least one expansion rule is applicable.
- The top-level context menu must open immediately; expensive field discovery and heuristics are deferred until the `Expand Selection...` submenu is opened.

## Initial Menu Structure

Example submenu:

1. `Match <fieldLabel> = <originValue> in <scopeLabel>` (default)
2. `Match <fieldLabel> = <originValue> across all` (optional, if configured)
3. `Replace selection` (initially only mode shown)

Examples (generated at runtime, not hardcoded):

1. `Match clusterId = C42 in this patient`
2. `Match fusionType = DEL in this sample`
3. `Match eventClass = translocation across all`

Label generation rules:

1. `fieldLabel` comes from configured rule label, then field title/alias, then raw field name.
2. `originValue` is formatted from pointed datum value (truncated if long).
3. `scopeLabel` comes from `partitionBy` config, for example `["patientId"]` -> `this patient`.
4. `scopeLabel` can also map `["sampleId"]` -> `this sample`.
5. `scopeLabel` falls back to `this scope` for multiple keys or unknown semantics.
6. If origin value is null/undefined, hide that rule by default unless explicitly configured.
7. If no human-friendly label is available, fallback to generic text: `Match related records in this scope`.

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

Implement as an `IntentPipeline` hook, similar to metadata action augmentation:

1. Validate payload and resolve `selector`.
2. Resolve origin datum.
3. Normalize predicate (`valueFromField` to literal values).
4. Compile/evaluate predicate against collector data.
5. Convert matched datums to key tuples using `encoding.key` fields.
6. Merge with existing selection by `operation`.
7. Dispatch action through `IntentExecutor`.
8. Reducer stores semantic intent entry.
9. Param bridge re-evaluates intent and applies serialized point value to runtime param.

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

## Phase 1: Types and Contracts

1. Add selection-expansion types in App type surface:
   - `packages/app/src/state/paramProvenanceSlice.js` (or new dedicated type module).
2. Add LogicalComposition and predicate leaf typings in Core/App shared typings as needed.
3. Add runtime validators/type guards for action payload.

Deliverable:

- Serializable action contract with tests for guard logic.

## Phase 2: Predicate Utilities

1. Add helper utilities to:
   - Traverse leaves (`forEachLeaf` equivalent).
   - Normalize leaf predicates from origin datum.
   - Compile logical predicate tree to expression string.
2. Reuse `createFunction` in `packages/core/src/utils/expression.js` for evaluation.
3. Add fail-fast errors for invalid operators/fields/ambiguous nodes.

Deliverable:

- Unit-tested predicate normalization and evaluation utility.

## Phase 3: Intent Pipeline Integration

1. Register a new `IntentPipeline` action hook:
   - Predicate: expansion action type.
   - Augment: resolve selector, origin datum, and collector.
2. Merge behavior by `operation`:
   - `replace`: result only.
   - `add`: union with current keys.
   - `remove`: subtract.
   - `toggle`: symmetric difference.
3. Ensure collector readiness and clear error messages if unavailable.

Deliverable:

- Expansion action dispatch path with compact, semantic payloads.

## Phase 4: Provenance Reducer + Bridge

1. Add reducer handling for new expansion action:
   - Store expansion intent as param provenance entry for the selected parameter.
2. Ensure `ParamProvenanceBridge` apply logic can evaluate intent and produce point values without regressions.
3. Decide grouping behavior for consecutive expansion actions.

Deliverable:

- Undo/redo/bookmark behavior verified for expansion actions.

## Phase 5: Action Info and UX Strings

1. Extend action info rendering in:
   - `packages/app/src/state/paramActionInfo.js`
2. Add concise titles and scope-aware wording.
3. Ensure provenance timeline distinguishes expansion from plain selection click.

Deliverable:

- Meaningful provenance entries for expansion intents.

## Phase 6: Context Menu UI

1. Integrate menu item into SampleView context menu builder path:
   - Add `Expand Selection...` top-level item.
   - Resolve a single eligible multi-point selection target param.
   - If multiple eligible multi-point params are found in the same UnitView, log a warning and disable expansion UI.
2. Populate `Expand Selection...` submenu lazily on open (not during main menu creation).
3. Run candidate-field extraction and heuristics only during submenu open.
4. Show candidate categorical fields from heuristic/config.
5. Build expansion actions from user choice and submit via `intentPipeline`.
6. Initial UI only uses `operation: "replace"` but payload supports all modes.

Deliverable:

- End-to-end user-triggered expansion through context menu.

### Phase 6b: App-Level Context Menu Outside SampleView

Goal: make expansion available for non-SampleView visualizations in App while keeping Core free of menu/UI code.

1. Register an App-level `contextmenu` interaction handler after `viewRoot` is ready.
2. Resolve expansion availability from current hover using `resolveSelectionExpansionContext(...)`.
3. If hover is inside a `SampleView` subtree, do nothing and let SampleView own context-menu behavior.
4. If hover is outside SampleView and expansion is available, open an App context menu containing expansion entries.
5. Keep expensive field extraction lazy by building field/options only when submenu is opened.
6. Keep dispatch path unchanged: menu callbacks dispatch `expandPointSelection` intent actions.

Deliverable:

- `Expand point selection` is available in App context menus for non-SampleView views.
- No Core-level menu rendering logic is introduced.

### Code Reuse and Duplication Control

Use a shared App module so SampleView and App-level menus render the same expansion options.

1. Extract expansion menu construction into a shared helper module (for example `selectionExpansionMenu.js`).
2. Keep `selectionExpansionContext.js` responsible for context/field-option resolution only.
3. Make both callers (`SampleView` and App-level context menu handler) use the same menu-construction helper.
4. Keep host-specific wrappers minimal:
   - SampleView wrapper only handles menu grouping/placement under view headers.
   - App wrapper only handles root-level menu placement.
5. Keep one canonical callback implementation that dispatches the same `expandPointSelection` payload shape from both hosts.

Deliverable:

- Single-source expansion menu logic in App.
- No duplicated label/operation/payload assembly logic across contexts.

## Phase 7: Tests

Add tests for:

1. Predicate tree validation, normalization, and expression compilation.
2. Action hook augmentation and materialization.
3. Partition behavior (`partitionBy`) with repeated IDs across scopes.
4. Operation semantics for `replace` in v1.
5. Provenance action titles and bookmark serialization.
6. Failure paths (missing key fields, missing collector, unresolved origin, multiple eligible point-selection params in one UnitView).

Likely test files:

- `packages/app/src/state/intentPipeline.test.js`
- `packages/app/src/state/paramProvenanceBridge.test.js`
- `packages/app/src/state/paramActionInfo.test.js`
- New tests near new utility modules.

## Phase 8: Documentation

1. Add user-facing docs for:
   - Expansion behavior.
   - Partition semantics.
   - Config examples.
2. Add developer docs for action payload and replay behavior.

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

1. During implementation, run focused suites frequently:
   - `npx vitest run packages/app/src/state/intentPipeline.test.js`
   - `npx vitest run packages/app/src/state/paramProvenanceBridge.test.js`
   - `npx vitest run packages/app/src/state/paramActionInfo.test.js`
   - Plus any new expansion-specific test files.
2. Before final commit, run workspace-level checks:
   - `npm -ws run test:tsc --if-present`
   - `npm run lint`
3. Before PR (or as final local validation), run full unit tests:
   - `npm test`

### Commit Plan

1. `feat(app): add selection expansion intent contract and predicate utilities`
2. `feat(app): add expansion intent pipeline and param provenance integration`
3. `feat(app): add lazy expansion submenu in context menu`
4. `test(app): add coverage for expansion intent and UI guard cases`
5. `docs(app): document selection expansion behavior and constraints`

## Acceptance Criteria (Initial Release)

1. User can right-click a datum and run one expansion action from context menu.
2. Expansion selects all matching points according to declarative predicate.
3. Partitioning works with arbitrary scope fields (not hardcoded to sample).
4. Provenance shows an explicit expansion action title.
5. Undo/redo works.
6. Bookmark payload size remains compact (no unbounded key tuple arrays) and URL-hash sharing remains practical.
7. Bookmark replay is semantically consistent; when source data changes, UI reports potential drift.
