# Parameters In Provenance Plan

## Goal

Track user-adjustable parameter changes in provenance (undo/redo and bookmarks),
so that selections and UI-bound parameters replay consistently with intent
actions. This is especially important for selections that affect downstream
aggregations and filters.

In this context, a "parameter" is a named, reactive value defined in the view
spec (`params`) that can drive expressions, selections, and bound UI inputs.
See [docs/grammar/parameters.md](../../docs/grammar/parameters.md).

## Scope

- Persist only parameters that are adjustable by end users:
  - variable params with `bind`
  - selection params (`select`)
- Do not mirror params in Redux state outside provenance; params remain owned by
  the view hierarchy/ParamMediator.
- Persist both origin (if known) and literal coordinates for selections.
- Non-origin selections are still persisted (user may have eyeballed a region).
- Point selections must use stable keys (via `encoding.key`), not `_uniqueId`.
- Missing keys/params during restore: warn the user and skip that restore step.

## File Pointers

- Core param plumbing: `packages/core/src/view/paramMediator.js`
- Selection types and helpers: `packages/core/src/selection/selection.js`
- Selection data types: `packages/core/src/types/selectionTypes.d.ts`
- Param spec types: `packages/core/src/spec/parameter.d.ts`
- App provenance engine: `packages/app/src/state/provenance.js`
- App intent pipeline: `packages/app/src/state/intentPipeline.js`
- Bookmark export/import: `packages/app/src/bookmark/bookmark.js`

## Provenance Action Shape

Introduce a provenance action that records param changes:

```
{
  type: "paramChange",
  selector: { scope: string[], param: string },
  value: ParamValue,
  origin?: ParamOrigin
}
```

`ParamValue` variants (JSON-serializable):

- Variable params: `{ type: "value", value: any }`
- Interval selections:
  - `{ type: "interval", intervals: Partial<Record<"x"|"y", [number, number] | [ChromosomalLocus, ChromosomalLocus] | null>> }`
- Point selections:
  - `{ type: "point", keyField: string, keys: Scalar[] }`

`ParamOrigin` (optional, structured):

- `{ type: "datum", view: ViewSelector, keyField: string, key: Scalar, intervalSources?: Record<string, { start?: string, end?: string }> }`

Notes:
- Store both `origin` and literal values in `value`. If origin resolution fails,
  restore from the literal values and warn the user.
- For interval selections, `intervalSources` records the data fields used to
  derive the interval endpoints per channel (e.g., `x`/`y`), using `start`/`end`
  to support width/height (e.g., `x`/`x2`, `y`/`y2`). The shape is channel-keyed
  so it can be extended beyond positional channels later.
- Point selections store keys only; do not store `_uniqueId`.
- There is no ordering requirement for multi-point selections.

## Coalescing and UX Semantics

1. The initial selection must always create a provenance action so it is
   undoable and visible in the provenance menu.
2. If the latest provenance action is a `paramChange` for the same param,
   update it in place instead of adding a new one.
3. As soon as a different action is recorded, subsequent param changes create
   a new provenance action.
4. Clearing a selection:
   - If the latest action is the selection action for that param, clearing
     should remove it (implicit step back).
   - If other actions happened after it, clearing becomes a new action.

## Core Support Needed

### 1) `encoding.key` (single field, future‑proof)

- Add `key?: FieldDefWithoutScale` to `Encoding` in
  `packages/core/src/spec/channel.d.ts`.
- Treat internally as `keyFields: string[]` to ease later multi-field support.

### 2) Lazy key index in `Collector`

Implement lazy lookup in `packages/core/src/data/collector.js`:

- `findDatumByKey(keyFields: string[], keyTuple: Scalar[])`
- Build a transient index on first use and cache it.
- Hard error if duplicate keys are found while building the index.
- Clear cached index on `reset()` and data changes.

### 3) Selection helpers

- Extend selection helpers to map between key tuples and selection value
  objects without changing `selectionTypes.d.ts` (internal types stay as-is).
- When mapping keys → datum during restore:
  - If `encoding.key` is missing, return `undefined` and let the app warn.
  - If a key cannot be resolved, return `undefined` for that element; the app
    warns and skips.

### 4) Pre‑refactors to unblock provenance integration

- ParamMediator: add a public `subscribe(paramName, listener)` API that returns
  an unsubscription function (avoid touching `paramListeners` directly).
  Semantics: listener fires when the stored value for the param changes; for
  expression params this means on upstream changes that re-evaluate to a
  different value (no-op when the value is unchanged).
- Param defaults: add a helper (core) to compute the default value for a param
  spec and reuse it in both `registerParam` and provenance restore.
- Selector key: add a core helper to build stable selector keys for params.
- Bookmarkable param enumeration: add a helper in `viewSelectors` to iterate
  bookmarkable params with their selectors (for apply/restore loops).
- Action info registry: keep sampleView action info intact, but add a separate
  param action info module registered via `addActionInfoSource`.

## App Integration Plan

### 1) Redux/provenance wiring (no param mirroring outside provenance)

- Add a lightweight `paramProvenanceSlice` (new file) whose state stores the
  current param values for the active provenance index:
  - State shape: `{ entries: Record<string, { selector, value, origin? }> }`
    keyed by a stable selector key (e.g., `scope.join("/") + ":" + param`).
  - `paramChange` action carries `{ selector, value, origin? }` and updates
    `entries`.
- Add the slice to the provenance reducer map in
  `packages/app/src/state/setupStore.js` so action types starting with
  `paramProvenanceSlice.name` are included by the `createProvenanceReducer`
  filter (the history only tracks matching action types).
- Enable coalescing via `redux-undo` `groupBy`:
  - For `paramChange`, return a stable key derived from the selector
    (e.g., `param:${scope.join("/")}/${param}`).
  - For other actions, return `null` so they break the group.
  - This guarantees the first param change is added to history and subsequent
    consecutive changes update the same history node.

### 2) Capture param changes into provenance

- Subscribe to ParamMediator changes after view initialization.
- For each param change, construct a `paramChange` action using selector
  addressing (scope + param).
- Dispatch the action via `intentExecutor.dispatch()` so it flows through the
  same augmentation/recording path as other intent actions.
- For clearing a selection, if the latest provenance action is the matching
  `paramChange`, dispatch `ActionCreators.undo()` instead of adding a new entry.

Implementation detail:
- Add a small `ParamProvenanceBridge` (new module) that:
  - Traverses the view tree to find bookmarkable params
    (`viewSelectors.isBookmarkableParam` or a new helper).
  - Registers listeners on each view’s `paramMediator` (add a public
    `subscribe` API).
  - Tracks a `suppressCapture` flag to avoid loops when applying provenance.

### 3) Replay param changes from provenance (sync back to ParamMediator)

- Subscribe to the provenance `present` state using `subscribeTo`.
- On any provenance index change (undo/redo/jump/restore), read the
  `paramProvenanceSlice` state from the present node and apply it:
  - For every bookmarkable param in the view tree:
    - If the selector key exists in `entries`, apply that value.
    - Otherwise apply the default value derived from the param spec.
- Apply values via `ParamMediator.getSetter()` while holding
  `suppressCapture = true` so the updates do not create new actions.
- If `origin` exists, attempt to resolve it first:
  - Resolve selector → param view using `resolveParamSelector`.
  - Resolve datum via `Collector.findDatumByKey`.
  - If resolution fails, fall back to the literal `value` and warn the user.

Default value derivation:
- Variable params: `param.value` or evaluated `param.expr` once.
- Selection params: use `createSinglePointSelection`/
  `createMultiPointSelection`/`createIntervalSelection` based on `select`.

### 4) User warnings

- Missing param on restore: warning dialog with actionable guidance
  (e.g., duplicate names or missing import scope).
- Missing key field or unresolved key: warning dialog with fix guidance
  (add `encoding.key` or update data).

### 5) Provenance UI labels

- Add a dedicated action info source for `paramChange` actions (separate from
  sampleView action info).
- Register the action info source after `genomeSpy.launch()` so `viewRoot`
  is available for selector resolution.
- Resolve `selector` to a view and use `view.getTitleText()` when available,
  falling back to `view.explicitName` or the param name.
- Suggested label formats:
  - Variable param: `Set <param> = <value>` (append `in <view>` if resolved).
  - Interval selection:
    - Active: `Brush <param> (x: a–b[, y: c–d]) in <view>`
    - Cleared: `Clear selection <param> in <view>`
  - Point selection:
    - Single: `Select <param> = <key> in <view>`
    - Multi: `Select <param> (N points) in <view>`
    - Cleared: `Clear selection <param> in <view>`
  - Origin (optional): append `from <originView>` when origin resolution succeeds.
- Use `formatInterval(view, interval)` for x‑axis interval formatting when possible.

## Tests

### Core tests

- `Collector` key index:
  - builds lazily and resolves keys
  - throws on duplicate keys
  - resets on data change
- `encoding.key` plumbing:
  - key field is propagated through encoding inheritance
  - key field is available to selection helpers
- Selection helpers:
  - point selection serialization uses key fields, not `_uniqueId`
  - interval serialization preserves channel coverage and nulls
  - origin metadata is recorded for interval endpoints when available

### App tests

- Provenance slice:
  - `paramChange` updates `entries` by selector key
  - `groupBy` coalesces consecutive changes for same selector
  - first change creates a new history node
- Capture pipeline:
  - listener wiring records initial selection changes
  - suppression prevents feedback loops when applying provenance
  - clearing selection triggers implicit undo when last action matches
- Restore pipeline:
  - undo/redo/jump applies `entries` to ParamMediator
  - missing entry applies default value derived from param spec
  - origin resolution success uses datum-derived values
  - origin resolution failure falls back to literal values and warns
- Serialization correctness:
  - interval selection persistence (numeric + locus)
  - point selection persistence using `encoding.key`
  - multi-point selection size/keys persisted without ordering assumptions
- Failure handling:
  - missing param selector warns and skips
  - missing key field warns and skips
  - unresolved keys warn and skip affected elements
  - duplicate key detection throws during index build
- UI/provenance menu:
  - action info labels for variable/interval/point selections
  - view title/explicit name fallback behavior

## Feasibility & Risks

- Feasibility: The plan fits existing provenance wiring (`redux-undo`), selector
  infrastructure, and ParamMediator ownership of param values. The only new
  slice is small and purely for provenance history.
- Listener lifecycle: Param listeners must be registered and disposed safely as
  view hierarchies are created/destroyed (e.g., lazy init, import instances).
- Default derivation: Must be consistent with `registerParam` for variable and
  selection params to avoid subtle mismatches after undo/redo.
- Coalescing correctness: Ensure the first param change creates a history node
  and subsequent changes only overwrite within the same group.

## AI/Automation Considerations

- Deterministic replay: provenance/bookmark state must fully restore selections
  so automated agents can repeat actions reliably.
- Stable addressing: selector scoping and `encoding.key` are critical for
  unambiguous references across imports and sessions.
- Action granularity: coalescing rules should match user intent so agent-driven
  undo/redo behaves predictably.
- Explainability: provenance labels must be readable so agents can narrate
  actions in natural language.
- Actionable warnings: failures resolving selectors/keys should produce clear
  fixes so agents can correct specs.

## Open Items

- Decide exact warning dialog copy for missing key/param restore.
  (labels already sketched above; refine wording when implementing).

## Incremental Implementation Plan

### Step 1: Core pre‑refactors (no behavior change)

- Add `ParamMediator.subscribe(paramName, listener)` with explicit semantics for
  expression params and an unsubscription return.
- Add a core helper to compute default param values and reuse in
  `ParamMediator.registerParam`.
- Add a core helper to build stable param selector keys.
- Add a core helper to enumerate bookmarkable params with selectors.

Tests:
- Extend `packages/core/src/view/paramMediator.test.js` for subscribe semantics
  (including expression params and unchanged values).
- Unit tests for selector key helper and bookmarkable param enumeration.

Commit: `refactor(core): add param utilities for provenance`

### Step 2: Core key support + selection serialization helpers

- Add `encoding.key` to `Encoding` (single field; internal list for future).
- Implement lazy key index in `Collector` (error on duplicates).
- Add selection helpers for key‑based point selection serialization and
  interval origin metadata.

Tests:
- Collector index tests (lazy build, reset, duplicate error).
- Encoding key propagation tests.
- Selection helper tests (key usage, interval origin metadata).

Commit: `feat(core): add key support for point selection persistence`

### Step 3: App provenance slice + coalescing

- Implement `paramProvenanceSlice` and include it in provenance reducer map.
- Configure `redux-undo` `groupBy` for `paramChange` coalescing.

Tests:
- Slice reducer updates `entries` by selector key.
- Coalescing: first change creates node, subsequent changes overwrite.

Commit: `feat(app): add provenance state for params`

### Step 4: Capture param changes into provenance

- Implement `ParamProvenanceBridge` to subscribe to param changes and dispatch
  `paramChange` via `IntentExecutor`.
- Implement suppression to avoid feedback loops.
- Implement implicit undo on clear when last action matches.

Tests:
- Capture of initial selection.
- Suppression prevents action storms when applying provenance.
- Clear selection triggers implicit undo.

Commit: `feat(app): capture param changes into provenance`

### Step 5: Replay/apply param provenance

- Subscribe to provenance present state.
- Apply `paramProvenanceSlice.entries` to ParamMediator.
- Apply defaults for missing entries using core default helper.

Tests:
- Undo/redo/jump applies entries.
- Missing entry resets to default.

Commit: `feat(app): apply param provenance to view params`

### Step 6: Origin resolution + warnings

- Resolve origin datum using `Collector.findDatumByKey`.
- Fall back to literal values on resolution failure.
- Show user‑visible warnings for missing params/keys/unresolved data.

Tests:
- Origin resolution success/failure paths.
- Missing param/key warnings.

Commit: `feat(app): restore selection origins with warnings`

### Step 7: Provenance UI labels

- Add param action info module and register it via `addActionInfoSource`.
- Use view title/explicit name fallback.
- Use interval formatting helpers.

Tests:
- Action info labels for variable/interval/point selections.
- Title fallback behavior.

Commit: `feat(app): add provenance labels for param changes`
