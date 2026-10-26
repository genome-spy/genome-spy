[GenomeSpy Core API](../index.md) / ProjectedSelectionApi

# Interface: ProjectedSelectionApi

Capability for a point selection projected onto one categorical field.

## Properties

### type

> `readonly` **type**: `"projected"`

***

### getValue

> **getValue**: () => [`ProjectedSnapshot`](ProjectedSnapshot.md)

#### Returns

[`ProjectedSnapshot`](ProjectedSnapshot.md)

***

### subscribe

> **subscribe**: (`listener`, `options?`) => () => `void`

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `listener` | (`value`) => `void` |
| `options?` | \{ `delivery?`: `"change"` \| `"commit"`; \} |
| `options.delivery?` | `"change"` \| `"commit"` |

#### Returns

() => `void`

***

### setValue

> **setValue**: (`values`) => `void`

Sets one-scalar tuples in field order, without resolving matching rows.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `values` | readonly (readonly `Scalar`[])[] |

#### Returns

`void`

***

### clear

> **clear**: () => `void`

#### Returns

`void`
