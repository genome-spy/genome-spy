# Parameter Bookmark Persistence Plan

## Goal

Persist user-adjustable parameter state in bookmarks and shareable URLs using
selector-scoped addressing (scope + param), with stable restoration across
imports. This plan focuses on parameters only; view selector infrastructure and
visibility persistence are already in place.

In this context, a "parameter" is a named, reactive value defined in the view
spec (`params`) that can drive expressions, selections, and bound UI inputs.
See [docs/grammar/parameters.md](../../docs/grammar/parameters.md).

## Scope

- Persist only parameters that are adjustable by end users:
  - variable params with `bind`
  - selection params (`select`)
- Apply persisted params only after the app is fully initialized (consistent
  with view visibility restoration timing).
- Ignore missing parameters on restore and warn the user with actionable
  guidance.

## Data Model (Wire Format)

Add parameter payload to `viewSettings` (bookmark/URL payload only):

```
viewSettings: {
  visibilities: [{ scope, view, visible }],
  params: [{ scope, param, value }]
}
```

`value` is JSON-serializable and depends on param type:

- Variable params: `{ type: "value", value: any }`
- Selection params:
  - Interval: `{ type: "interval", intervals: Partial<Record<"x"|"y", [number, number] | [ChromosomalLocus, ChromosomalLocus] | null>> }`
  - Point: `{ type: "point", keyField: string, keys: Scalar[] }`

Notes:
- Point selections are serialized using stable keys derived from
  `encoding.key`. `_uniqueId` must not be persisted.
- Interval selections are stored in domain units (no `domainAtActionTime`).

## Core Support Needed

### 1) `encoding.key` (single field, future‑proof)

- Add `key?: FieldDefWithoutScale` to `Encoding` in
  `packages/core/src/spec/channel.d.ts`.
- Related core files:
  - `packages/core/src/view/view.js` (encoding inheritance)
  - `packages/core/src/view/unitView.js` (mark encoding usage)
- Treat internally as `keyFields: string[]` (for a smooth later migration to
  multi-field keys).

### 2) Lazy key index in `Collector`

Implement lazy lookup utilities in `packages/core/src/data/collector.js`:

- `findDatumByKey(keyFields: string[], keyTuple: Scalar[])`
- Internally build a transient index on first use and cache it.
- Hard error if duplicate keys are detected during index construction.
- Clear cached index on `reset()` and data changes.
- Related core files:
  - `packages/core/src/data/transforms/identifier.js` (synthetic ids)
  - `packages/core/src/selection/selection.js` (selection creation helpers)
  - `packages/core/src/types/selectionTypes.d.ts` (selection shapes)

## App Integration Plan

### 1) Payload Types (no Redux mirroring)

- Extend bookmark payload types (no Redux state storage):
  - `packages/app/src/state.d.ts` `ViewSettingsPayload` gains `params`.
  - `packages/app/src/bookmark/databaseSchema.d.ts` includes `params`.
- Related app files:
  - `packages/app/src/bookmark/bookmark.js` (restore/save flow)
  - `packages/app/src/app.js` (URL hash update/restore timing)

### 2) Utilities

Add `paramSettingsUtils` (new) or extend `viewSettingsUtils` (payload-only):

- `makeParamSelectorKey({ scope, param })`
- `parseParamSelectorKey(key)`
- `normalizeParamSettingsPayload(payload)`
- `buildParamSettingsPayload(viewRoot)` (derive from view tree)
- `applyParamSettings(viewRoot, entries)` (resolves selectors and applies values)
- Related app files:
  - `packages/app/src/viewSettingsUtils.js` (visibility payloads)
  - `packages/app/src/viewSettingsSlice.js` (state updates)

### 3) Serialize (derive from view tree)

- In `app._updateStateToUrl` / bookmark save:
  - Build `params` payload directly from the view tree (no Redux state).
  - Store under `viewSettings.params`.

### 4) Restore (apply after init)

- After `genomeSpy.launch()` completes:
  - Resolve param entries via selector scope + param.
  - Apply using `paramMediator.getSetter(name)(value)`.
  - If missing param or key cannot be resolved, show a user-facing warning with
    fix guidance.

### 5) Point selection restore

- If `encoding.key` is missing: warn + skip.
- Use `Collector.findDatumByKey` to map stored keys → datum.
- Build selection value using existing `createSinglePointSelection` /
  `createMultiPointSelection` (selection types remain unchanged).

## Tests

### Core tests

- `Collector` key index:
  - builds lazily and resolves keys
  - throws on duplicate keys
  - resets on data change

### App tests

- Param payload round-trip (save → restore).
- Interval selection persistence (numeric + locus).
- Point selection persistence using `encoding.key`.
- Missing key or param: user warning is emitted (non-fatal).

## Open Items

- Decide exact warning dialog copy for missing key/param restore.
- Decide where to store param state in Redux (new slice vs. within viewSettings
  map).
