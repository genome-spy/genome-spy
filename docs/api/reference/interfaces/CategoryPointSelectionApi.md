[GenomeSpy Core API](../index.md) / CategoryPointSelectionApi

# Interface: CategoryPointSelectionApi

Scoped raw category membership. Writes require neither row keys nor data readiness.

## Properties

### type

> `readonly` **type**: `"point"`

***

### membership

> `readonly` **membership**: `"categories"`

***

### getValue

> **getValue**: () => [`CategoryPointSnapshot`](CategoryPointSnapshot.md)

#### Returns

[`CategoryPointSnapshot`](CategoryPointSnapshot.md)

***

### subscribe

> **subscribe**: (`listener`, `options?`) => () => `void`

Point change and commit delivery are equivalent.

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

Replace the complete membership with detached one-value tuples.

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
