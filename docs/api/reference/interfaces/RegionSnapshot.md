[GenomeSpy Core API](../index.md) / RegionSnapshot

# Interface: RegionSnapshot

Snapshot of a lasso and its selected rows. A lasso with no matches remains active.

## Properties

### type

> **type**: `"region"`

Selection kind.

***

### active

> **active**: `boolean`

Whether a lasso exists, even if it selects no rows.

***

### status

> **status**: `"cleared"` \| `"pending"` \| `"ready"`

Cleared, waiting for a saved lasso's rows, or finished selecting rows.

***

### intent

> **intent**: `RegionSelectionIntent`

Saved lasso shape and original axes, or null after clearing.

***

### data

> **data**: readonly `Readonly`<`Record`<`string`, `unknown`\>\>[]

Copies of selected rows. Empty while waiting, after clearing, or with no matches.
