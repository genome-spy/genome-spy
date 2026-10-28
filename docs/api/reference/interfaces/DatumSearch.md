[GenomeSpy Core API](../index.md) / DatumSearch

# Interface: DatumSearch

Independent matching of terms against encoding.search fields. No coordinate parsing.

## Methods

### findDatums()

> **findDatums**(`query`, `options`): [`DatumSearchResult`](DatumSearchResult.md)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | `string` |
| `options` | [`DatumSearchOptions`](DatumSearchOptions.md) |

#### Returns

[`DatumSearchResult`](DatumSearchResult.md)

***

### listSearchableViews()

> **listSearchableViews**(`options?`): [`SearchableView`](SearchableView.md)[]

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | \{ `view?`: [`ViewHandle`](ViewHandle.md); `exampleLimit?`: `number`; \} |
| `options.view?` | [`ViewHandle`](ViewHandle.md) |
| `options.exampleLimit?` | `number` |

#### Returns

[`SearchableView`](SearchableView.md)[]
