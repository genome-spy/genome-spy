[GenomeSpy Core API](../index.md) / RegionSelectionApi

# Interface: RegionSelectionApi

Access selected rows after drawing finishes; clearing removes the lasso and its rows.

## Properties

### type

> `readonly` **type**: `"region"`

***

### getValue

> **getValue**: () => [`RegionSnapshot`](RegionSnapshot.md)

#### Returns

[`RegionSnapshot`](RegionSnapshot.md)

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

### clear

> **clear**: () => `void`

#### Returns

`void`
