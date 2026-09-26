[GenomeSpy Core API](../index.md) / ViewAnnotations

# Interface: ViewAnnotations

## Properties

### replace

> **replace**: (`set`, `options?`) => `Promise`<`void`\>

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `set` | [`ViewAnnotationSet`](ViewAnnotationSet.md) |
| `options?` | \{ `signal?`: `AbortSignal`; \} |
| `options.signal?` | `AbortSignal` |

#### Returns

`Promise`<`void`\>

***

### clear

> **clear**: () => `Promise`<`void`\>

#### Returns

`Promise`<`void`\>

***

### inspect

> **inspect**: () => [`ViewAnnotationState`](ViewAnnotationState.md)

#### Returns

[`ViewAnnotationState`](ViewAnnotationState.md)

***

### dispose

> **dispose**: () => `void`

#### Returns

`void`
