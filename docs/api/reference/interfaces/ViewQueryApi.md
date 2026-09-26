[GenomeSpy Core API](../index.md) / ViewQueryApi

# Interface: ViewQueryApi

Optional inspection of the live hierarchy owned by one view API.

Import this type and `createViewQuery()` from `@genome-spy/core/view-query`.
Create the query object with `createViewQuery(api.views)`.

## Properties

### assessAnnotations

> **assessAnnotations**: (`address`) => [`ViewAnnotationAssessment`](../type-aliases/ViewAnnotationAssessment.md)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `address` | [`ViewAddress`](../type-aliases/ViewAddress.md) |

#### Returns

[`ViewAnnotationAssessment`](../type-aliases/ViewAnnotationAssessment.md)

***

### annotations

> **annotations**: [`ViewAnnotations`](ViewAnnotations.md)

***

### describe

> **describe**: (`address`) => [`ViewDescription`](ViewDescription.md)

Returns detached metadata. Throws for a removed view or finalized embed.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `address` | [`ViewAddress`](../type-aliases/ViewAddress.md) |

#### Returns

[`ViewDescription`](ViewDescription.md)

***

### assessQuery

> **assessQuery**: (`address`, `options`) => [`ViewQueryAssessment`](../type-aliases/ViewQueryAssessment.md)

Assesses the requested scope without scanning rows. Execution rechecks it.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `address` | [`ViewAddress`](../type-aliases/ViewAddress.md) |
| `options` | [`ViewQueryScopeOptions`](ViewQueryScopeOptions.md) |

#### Returns

[`ViewQueryAssessment`](../type-aliases/ViewQueryAssessment.md)

***

### queryData

> **queryData**: (`address`, `options`) => `Promise`<[`ViewSliceQueryResult`](ViewSliceQueryResult.md)\>

Queries the current data-space viewport, optionally intersected with an interval selection.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `address` | [`ViewAddress`](../type-aliases/ViewAddress.md) |
| `options` | [`ViewSliceQueryOptions`](ViewSliceQueryOptions.md) |

#### Returns

`Promise`<[`ViewSliceQueryResult`](ViewSliceQueryResult.md)\>

***

### readData

> **readData**: (`address`, `options`) => [`ViewDataReadResult`](ViewDataReadResult.md)

Returns a bounded detached read from one ready unit view with at most one facet batch.
Throws for unready data, containers, removed views, finalized embeds,
multiple facet batches, non-cloneable returned values, or shared memory.
The row bound does not bound the size of an individual nested datum.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `address` | [`ViewAddress`](../type-aliases/ViewAddress.md) |
| `options` | [`ViewDataReadOptions`](ViewDataReadOptions.md) |

#### Returns

[`ViewDataReadResult`](ViewDataReadResult.md)
