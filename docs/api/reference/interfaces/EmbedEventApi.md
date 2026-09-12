[GenomeSpy Core API](../index.md) / EmbedEventApi

# Interface: EmbedEventApi

Subscriptions for native input on the embedded GenomeSpy canvas.

## Properties

### subscribe

> **subscribe**: (`type`, `listener`) => () => `void`

Subscribes synchronously before Core handles the event and returns an
unsubscribe function.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | [`NativeEventType`](../type-aliases/NativeEventType.md) |
| `listener` | (`event`) => `void` |

#### Returns

() => `void`
