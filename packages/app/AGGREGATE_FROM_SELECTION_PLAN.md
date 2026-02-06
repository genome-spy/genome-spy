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

## Proposed Design

### 1) Data Model: interval vs. intervalSource (exclusive)

Replace `IntervalSpecifier` with a union where **only one** of `interval` or
`intervalSource` is present.

```
type IntervalLiteralSpecifier = {
  view: ViewRef;
  field: string;
  aggregation: AggregationSpec;
  interval: Interval;
  intervalSource?: never;
};

type IntervalSourceSpecifier = {
  view: ViewRef;
  field: string;
  aggregation: AggregationSpec;
  interval?: never;
  intervalSource: {
    type: "selection";
    selector: ParamSelector;
  };
};
```

### 2) Capture: build intervalSource when possible

When the context menu is built:
- Detect active interval selection (x-encoding) in ancestor chain.
- If the selection param is bookmarkable and addressable, use
  `getParamSelector(view, paramName)` to build `intervalSource`.
- Do **not** record `interval` in this case.
- If not resolvable/addressable, fall back to `interval` (current behavior).

### 3) Resolve at Action Execution Time

When building attribute accessors:
- If `intervalSource` is present:
  - Resolve the selector via `resolveParamSelector(rootView, selector)`.
  - Read the interval selection from ParamMediator.
  - Use the **numeric domain** interval directly (no chrom/pos conversion).
  - If resolution fails or the selection is empty, **throw** to abort replay
    and avoid inconsistent state.
- If `interval` is present, use it directly.

### 4) Action Info (Provenance Labels)

If `intervalSource` is present, label actions using the selection param name
instead of coordinates. Example:

```
Sort by count in selection <param>
```

If `interval` is present, keep existing coordinate-based labels.

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
  - `intervalSource` yields titles referencing selection param (no coordinates).
  - `interval` yields existing coordinate-based titles.
- `attributeAccessors` / resolver:
  - `intervalSource` resolves numeric interval from selection param.
  - Throws when selector cannot resolve or selection is empty.
  - `interval` still works as before.

### Integration tests

- `sampleView/state/actionInfo.test.js`:
  - Action label uses selection param for source-based interval.
- `sampleView/attributeAggregation/attributeAccessors.test.js`:
  - Accessor reads selection interval from ParamMediator at execution time.

## Step-by-Step Plan

### Step 1: Types and specifier helpers

- Update `IntervalSpecifier` types to the union described above.
- Update `isIntervalSpecifier` helper to recognize both forms.

Commit: `refactor(app): split interval specifiers by source`

### Step 2: Capture intervalSource in context menu

- Extend `#getActiveIntervalSelection` to return `paramName`.
- Build `intervalSource` using `getParamSelector` when possible.
- Keep literal `interval` fallback when not resolvable.

Commit: `feat(app): capture interval source selections`

### Step 3: Resolve intervalSource in accessors

- Add resolver that maps `intervalSource` -> numeric interval from ParamMediator.
- Throw on resolution failure / empty selection.
- Keep literal `interval` support unchanged.

Commit: `feat(app): resolve interval sources in accessors`

### Step 4: Action info and titles

- If `intervalSource` exists, show param-based title (no coordinates).
- Keep existing labels for literal intervals.

Commit: `feat(app): label interval actions by selection source`

### Step 5: Tests

- Add/adjust tests for the new union, resolution behavior, and labels.
- Ensure failures throw and abort replay (test via thrown error).

Commit: `test(app): cover interval source specifiers`
