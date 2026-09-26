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

Returned fields, or required input columns for analysis. Omit for whole raw rows.

***

### limit

> **limit**: `number` \| `null`

Maximum returned rows (nonnegative safe integer), or null for all output rows. Does not limit scanning or aggregation.

***

### aggregate?

> `optional` **aggregate?**: [`ViewSliceAggregate`](ViewSliceAggregate.md)[]

Compute each operation over all matching loaded rows, even when rows are truncated.

***

### analysis?

> `optional` **analysis?**: [`ViewSliceAnalysisStage`](../type-aliases/ViewSliceAnalysisStage.md)[]

Transform all scoped rows before limiting. Requires fields; excludes aggregate.

***

### includeAnnotationTargets?

> `optional` **includeAnnotationTargets?**: `boolean`

Return temporary opaque references for row-preserving point queries.

***

### signal?

> `optional` **signal?**: `AbortSignal`
