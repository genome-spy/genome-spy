[GenomeSpy Core API](../index.md) / ViewSliceQueryOptions

# Interface: ViewSliceQueryOptions

## Extends

- [`ViewQueryScopeOptions`](ViewQueryScopeOptions.md)

## Properties

### channels

> **channels**: (`"x"` \| `"y"`)[]

Numeric or locus viewport axes to intersect. No pixel visibility is implied.

#### Inherited from

[`ViewQueryScopeOptions`](ViewQueryScopeOptions.md).[`channels`](ViewQueryScopeOptions.md#channels)

***

### selection?

> `optional` **selection?**: `string`

Named interval selection in this view's parameter scope. A wholly cleared selection matches no rows.

#### Inherited from

[`ViewQueryScopeOptions`](ViewQueryScopeOptions.md).[`selection`](ViewQueryScopeOptions.md#selection)

***

### fields?

> `optional` **fields?**: `string`[]

Returned fields. Omit for whole rows.

***

### limit

> **limit**: `number` \| `null`

Maximum returned rows (nonnegative safe integer), or null for all matching rows. Does not limit scanning.

***

### signal?

> `optional` **signal?**: `AbortSignal`
