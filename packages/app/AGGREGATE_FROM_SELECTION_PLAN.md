# Aggregate From Selection Plan

## Goal

Allow interval-based sample actions (sort, filter, group, derive metadata, etc.)
to **reference an active interval selection** instead of baking a literal
interval into the action payload. This keeps provenance replay consistent with
the user’s intent: actions can depend on the selection that produced them.

User-facing impact:
- If a user brushes a region and then sorts by “count in selection”, replaying
  the history will resolve the interval from the selection param instead of a
  stale snapshot.
- Bookmarks become more robust because they encode the dependency, not just the
  numbers.

## Non-Goals (for now)

- No “expand selection” or other interval transforms. Those will be separate
  actions later.
- No change to point queries or non-interval attributes.
- No new provenance dependency graph yet; this is an incremental link.

## Current Behavior (Problem)

`IntervalSpecifier` always stores a literal `interval`. Actions such as
`sortBy` or `filterByQuantitative` use that literal interval during replay,
regardless of the current selection state. This breaks the intent chain when
selections are persisted independently in provenance.

## Implemented Design

### 1) Data Model: single `interval` field with interval references

`IntervalSpecifier` now uses a single `interval` field with union type:

```
type IntervalReference = Interval | SelectionIntervalSource;
```

This keeps payload shape stable while still allowing source-based intervals.

### 2) Capture: build selection interval references when possible

When the context menu is built:
- Detect active interval selection (x-encoding) in ancestor chain.
- If the selection param is bookmarkable and addressable, use
  `getParamSelector(view, paramName)` to build `intervalSource`.
- Record `interval` as a `SelectionIntervalSource` in this case.
- If not resolvable/addressable, fall back to literal `interval`.

### 3) Resolve at action execution time

When building attribute accessors:
- If `interval` is a `SelectionIntervalSource`:
  - Resolve selector via `resolveParamSelector(rootView, selector)`.
  - Read selection from `ParamMediator`.
  - Use numeric x-interval directly.
  - Throw on unresolved/empty/invalid selection to abort replay and avoid inconsistent state.
- If `interval` is literal, use it directly.

### 4) Action info (provenance labels)

If `interval` is a selection reference, label actions using the selection param name
instead of coordinates. Example:

```
Sort by count in selection <param>
```

If `interval` is literal, keep coordinate-based labels.

## File Pointers

- Types: `packages/app/src/sampleView/sampleViewTypes.d.ts`
- Context menu specifier creation:
  `packages/app/src/sampleView/contextMenuBuilder.js`
- Selection lookup for context menu:
  `packages/app/src/sampleView/sampleView.js` (`#getActiveIntervalSelection`)
- View/param selectors: `packages/core/src/view/viewSelectors.js`
- Attribute accessors:
  `packages/app/src/sampleView/attributeAggregation/attributeAccessors.js`
- Attribute info/labels:
  `packages/app/src/sampleView/viewAttributeInfoSource.js`
- Action info labels:
  `packages/app/src/sampleView/state/actionInfo.js`

## Tests

### Unit tests

- `viewAttributeInfoSource`:
  - selection interval references yield titles referencing selection param (no coordinates).
  - `interval` yields existing coordinate-based titles.
- `attributeAccessors` / resolver:
  - selection interval references resolve numeric interval from selection param.
  - Throws when selector cannot resolve or selection is empty.
  - `interval` still works as before.

### Integration tests

- `sampleView/state/actionInfo.test.js`:
  - Action label uses selection param wording for source-based interval.
- `sampleView/attributeAggregation/attributeAccessors.test.js`:
  - Accessor reads selection interval from ParamMediator at execution time.
- `sampleView/sampleViewLazyReady.test.js`:
  - `ensureViewAttributeAvailability` rejects on unresolved/empty selection source.

## Status

Completed:
- Step 1: types/guards migrated to single `interval` field (`IntervalReference`).
- Step 2: context menu captures selection references and falls back to literal intervals.
- Step 3: selection references resolve at execution time; failures abort replay.
- Step 4: attribute titles show selection param names for source-based intervals.
- Step 5: unit/integration coverage added for resolver, accessors, titles, and ensure-path failures.

Remaining:
- Run full app test suite (`npm test`) before merge.
- Optional: add end-to-end intent pipeline test asserting no dispatch on selection-source resolution failure.
