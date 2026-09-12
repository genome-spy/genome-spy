[GenomeSpy Core API](../index.md) / ParamApi

# Interface: ParamApi<T\>

A handle for reading, writing, and subscribing to an explicit parameter.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` | [`ParamValue`](../type-aliases/ParamValue.md) |

## Properties

### getValue

> **getValue**: () => `T`

Returns the current parameter value.

#### Returns

`T`

***

### setValue

> **setValue**: (`value`) => `void`

Sets the parameter value. Computed `expr` parameters throw when set.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `T` |

#### Returns

`void`

***

### subscribe

> **subscribe**: (`listener`) => () => `void`

Subscribes to parameter changes. Returns an unsubscribe function.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `listener` | (`value`) => `void` |

#### Returns

() => `void`
