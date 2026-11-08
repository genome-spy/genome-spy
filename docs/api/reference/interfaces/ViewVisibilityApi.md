[GenomeSpy Core API](../index.md) / ViewVisibilityApi

# Interface: ViewVisibilityApi

Visibility changes retain live views, data, selections and authored defaults.

## Properties

### getSnapshot

> **getSnapshot**: () => [`ViewVisibilityNode`](ViewVisibilityNode.md)[]

Detached named-view hierarchy; no live handles, data or rendering primitives.

#### Returns

[`ViewVisibilityNode`](ViewVisibilityNode.md)[]

***

### set

> **set**: (`address`, `visible`) => `Promise`<`void`\>

Change a uniquely named view; radio groups update together. Resolves after data initialization, with layout scheduled.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `address` | [`ViewAddress`](../type-aliases/ViewAddress.md) |
| `visible` | `boolean` |

#### Returns

`Promise`<`void`\>

***

### reset

> **reset**: () => `Promise`<`void`\>

Remove all overrides and apply authored defaults, respecting radio groups.

#### Returns

`Promise`<`void`\>
