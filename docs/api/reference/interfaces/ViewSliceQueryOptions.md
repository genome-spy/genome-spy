[GenomeSpy Core API](../index.md) / ViewSliceQueryOptions

# Interface: ViewSliceQueryOptions

## Properties

### channels

> **channels**: (`"x"` \| `"y"`)[]

Numeric or locus viewport axes to intersect. No pixel visibility is implied.

***

### selection?

> `optional` **selection?**: `string`

Named interval selection in this view's parameter scope. A wholly cleared selection matches no rows.

***

### fields?

> `optional` **fields?**: `string`[]

Returned fields. Omit to return whole detached rows.

***

### limit

> **limit**: `number`

Maximum returned rows, 0–1000. Does not limit scanning or aggregation.

***

### aggregate?

> `optional` **aggregate?**: [`ViewSliceAggregate`](ViewSliceAggregate.md)[]

Compute each operation over all matching loaded rows, even when rows are truncated.

***

### signal?

> `optional` **signal?**: `AbortSignal`
