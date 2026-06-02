# Sample Group-Level Actions Plan

## Goal

Add SampleHierarchy intent actions for group-level operations:

- Retain the top or bottom `k` groups at a grouping level, ranked by group
  size.
- Retain groups at a grouping level whose size satisfies a threshold.
- Ungroup a selected grouping level and all deeper levels while preserving the
  current visible sample subset.

The actions must be available through both the UI context menu in `sampleGroupView.js`
and the agent intent action system.

## Conceptual Model

Think of these actions like grouped-data operations, closer to `dplyr::group_by`
than direct tree manipulation.

The current SampleHierarchy defines grouping levels. A group-level action:

1. Selects a target grouping level.
2. Operates on groups or samples at that level.
3. Updates the current hierarchy without restoring samples that previous actions
   removed.

For ranked operations, ancestor groups before the target level define independent
partitions. For example, retaining the top 3 groups at `level: 1` means:

```text
For ROOT, rank its level-1 child groups by size and keep 3.
```

This matches the hierarchy semantics while leaving room for future measures, such
as retaining top groups by mean value of another attribute.

## Semantics

Use level-based actions, not parent-path actions.

- `level: 1` targets top-level groups under `ROOT`.
- `level: 2` targets direct children of every top-level group.
- `level: 3` targets direct children of every level-2 group.
- The initial group-level measure is `size`, the number of descendant visible
  samples.

For ranked retention, apply ranking separately within each ancestor partition.
For example, with `level: 2` and `limit: 3`, each top-level group keeps its own
three largest or smallest child groups.

For threshold retention, apply the predicate to every group at the selected
level. For example, with `level: 2`, `operator: "gte"`, and `operand: 10`, every
level-2 group with size at least 10 is kept.

Ties in ranked retention preserve current group order.

Ungrouping collapses the selected level and all deeper levels into the parent
level. It keeps only samples currently present in the hierarchy. It does not
restore samples removed by previous retention or filtering actions.

For example:

```text
1. Group by cancer type.
2. Keep the top 5 cancer-type groups by size.
3. Ungroup at level 1.
```

The result has no grouping, but it contains only the samples that belonged to the
retained top 5 cancer-type groups.

With nested grouping, `level: 2` keeps level-1 groups but replaces each level-1
group's children with the flat descendant samples currently under that level-1
group. Deeper levels are removed.

Prefer provenance/undo when the user wants to reverse a previous grouping action
and restore the earlier state. Use ungroup when the user wants to remove grouping
structure while keeping the current retained or filtered sample subset.

## Action API

Add reducer-facing actions for retention and ungrouping.

```ts
interface RetainGroupsByRank {
    /**
     * One-based grouping level to filter.
     *
     * `1` targets top-level groups under ROOT. `2` targets direct children of
     * level-1 groups, and so on.
     */
    level: number;

    /**
     * Group-level measure used for ranking.
     *
     * Only `"size"` is supported initially. It means the number of descendant
     * visible samples in the group. Keep this field to make the action semantics
     * explicit and leave room for future measures.
     */
    measure: "size";

    /**
     * Number of ranked groups to retain within each ancestor partition.
     */
    limit: number;

    /**
     * Ranking direction.
     *
     * Use `"descending"` for top-k, highest values, largest groups by size, or
     * most abundant groups. Use `"ascending"` for bottom-k, lowest values,
     * smallest groups by size, or least abundant groups.
     */
    order: "descending" | "ascending";
}
```

```ts
interface RetainGroupsBySize {
    /**
     * One-based grouping level to filter.
     *
     * `1` targets top-level groups under ROOT. `2` targets direct children of
     * level-1 groups, and so on.
     */
    level: number;

    /**
     * Group-level measure used for thresholding.
     *
     * Only `"size"` is supported initially. It means the number of descendant
     * visible samples in the group. Keep this field to make the action semantics
     * explicit and leave room for future measures.
     */
    measure: "size";

    /**
     * Comparison applied as `measure operator operand`.
     */
    operator: ComparisonOperatorType;

    /**
     * Numeric sample-count threshold.
     */
    operand: number;
}
```

```ts
interface Ungroup {
    /**
     * One-based grouping level to collapse.
     *
     * `1` collapses top-level groups under ROOT and all deeper levels into one
     * flat ROOT sample group. `2` keeps level-1 groups but collapses their
     * children and all deeper levels into sample lists.
     */
    level: number;
}
```

## Agent Docs

Document the semantics in reducer JSDoc and `payloadTypes.d.ts`, because the
agent action catalog and schema are generated from those sources.

Use direct wording:

- "One-based grouping level."
- "Use `level: 1` for top-level groups under ROOT."
- "Ranked retention is applied separately within each ancestor partition."
- "`measure: \"size\"` means the number of descendant visible samples in the group."
- "Threshold filtering applies to every group at the selected level."
- "Ungroup collapses the selected grouping level and all deeper levels while
  keeping only samples currently present in the hierarchy."
- "Use provenance/undo instead when the user only wants to reverse a previous
  grouping action and restore the prior state."

Current `AgentVolatileContext.sampleGroupLevels` already exposes valid level
numbers and grouping attributes. Do not add full group listings by default.

If exact group-size context is later needed, add a compact summary rather than
full group paths:

```ts
interface AgentSampleGroupSizeSummary {
    level: number;
    parentCount: number;
    groupCount: number;
    sizeMin: number;
    sizeMax: number;
}
```

## UI

In `packages/app/src/sampleView/sampleGroupView.js`, derive the clicked group's
level from its path:

```js
const level = foundPath.length;
```

Suggested context menu layout:

```text
[Group title/path header]
Remove group
---
Retain groups at this level
  Ranked groups by size...
  Groups by size threshold...
---
Ungroup from this level
```

For single-level grouping, avoid exposing "level 1" in user-facing labels. The
user has no visible reason to think in grouping levels when there is only one
grouping attribute:

```text
Ranked groups by size...
Groups by size threshold...
Ungroup
```

For multi-level grouping, include "this level" in menu labels because the clicked
group's depth matters:

```text
Ranked groups by size at this level...
Groups by size threshold at this level...
Ungroup from this level
```

Dialogs should carry the precise semantics, but should also avoid unnecessary
level wording for single-level grouping:

```text
Retain ranked groups by size
Keep the 5 largest groups separately within each ancestor group.
```

```text
Retain groups by size
Keep groups where size is >= 10.
```

For multi-level grouping, dialog titles may include either "this level" or a
concrete attribute title if available:

```text
Retain ranked groups by size at this level
Keep the 5 largest groups separately within each ancestor group.
```

Ungroup action text should make the distinction from undo visible, without
mentioning the numeric level unless multiple levels make it useful:

```text
Ungroup
Collapse groups, keeping the current samples.
```

```text
Ungroup from this level
Collapse this level and deeper levels, keeping the current samples.
```

Ungroup does not need a dialog. The clicked group already determines the level,
and the action has no additional parameters.

## Files To Touch

- `packages/app/src/sampleView/state/groupOperations.js`
  - Add recursive sample-count helpers.
  - Add level-wise top-k filtering.
  - Add level-wise threshold filtering.
  - Add level-wise ungrouping that flattens descendant samples into the parent
    level and removes deeper group structure.

- `packages/app/src/sampleView/state/payloadTypes.d.ts`
  - Add `RetainGroupsByRank`.
  - Add `RetainGroupsBySize`.
  - Add `Ungroup`.

- `packages/app/src/sampleView/state/sampleSlice.js`
  - Add reducers.
  - Add agent-facing JSDoc and examples.
  - Truncate `groupMetadata` to `level - 1` when ungrouping.

- `packages/app/src/sampleView/state/actionInfo.js`
  - Add menu and provenance titles.

- `packages/app/src/sampleView/sampleGroupView.js`
  - Build the level-specific group context menu.
  - Dispatch the new actions from dialogs.
  - Dispatch ungroup directly from the context menu.

- `packages/app/src/sampleView/groupDialogs/retainGroupsByRankDialog.js`
  - Add a small dialog for `limit` and ascending/descending mode.
  - The context menu opens this single dialog instead of separate top and bottom
    menu items.

- `packages/app/src/sampleView/groupDialogs/retainGroupsBySizeDialog.js`
  - Add a small dialog using the existing threshold comparison input.

- `packages/app-agent/src/agent/generated/*`
  - Regenerate after adding reducer docs and payload types.

## Tests

Add or extend tests in:

- `packages/app/src/sampleView/state/groupOperations.test.js`
  - Ranked retention at level 1.
  - Ranked retention at nested levels, applied separately per ancestor partition.
  - Smallest-ranked retention.
  - Tie behavior preserving current order.
  - Threshold retention at level 1 and nested levels.
  - Ungroup at level 1 flattens retained top-level groups into ROOT samples.
  - Ungroup at nested levels keeps ancestor groups and flattens descendant
    samples below them.
  - Ungroup does not restore samples removed by previous retention.
  - Invalid level errors.

- `packages/app/src/sampleView/state/sampleSlice.test.js`
  - Reducer behavior for all actions.
  - Failure before grouping.

- `packages/app/src/sampleView/state/actionInfo.test.js`
  - Menu and provenance titles for both actions.

Run focused verification:

```bash
npx vitest run packages/app/src/sampleView/state/groupOperations.test.js packages/app/src/sampleView/state/sampleSlice.test.js packages/app/src/sampleView/state/actionInfo.test.js
npm --workspace @genome-spy/app-agent run check:agent
npm --workspaces run test:tsc --if-present
```

Regenerate agent artifacts:

```bash
npm --workspace @genome-spy/app-agent run generate:agent
```
