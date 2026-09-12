[GenomeSpy Core API](../index.md) / MarksApi

# Interface: MarksApi

Mark interaction subscriptions and explicit picking for one view subtree.

Subscriptions belong to the view handle that created them and are disposed
automatically when that view is removed or the embed is finalized.

## Properties

### subscribe

> **subscribe**: (`type`, `listener`) => () => `void`

Subscribes to a mark event and returns an unsubscribe function.

The event coordinates are picked before the listener is called. The
listener may therefore run asynchronously when the active renderer uses
asynchronous readback. Browser-level cancellation must happen
synchronously through `EmbedEventApi.subscribe()`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | `"click"` \| `"dblclick"` \| `"contextmenu"` |
| `listener` | (`event`) => `void` \| `Promise`<`void`\> |

#### Returns

() => `void`

***

### observeHover

> **observeHover**: (`listener`) => () => `void`

Subscribes to changes in the current hovered mark and returns an
unsubscribe function. The listener is called once immediately with the
current hit, or `undefined` when no mark is hovered.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `listener` | (`hit`) => `void` |

#### Returns

() => `void`

***

### pick

> **pick**: (`point`) => `Promise`<\{ `status`: `"hit"`; `hit`: [`MarkHit`](MarkHit.md); \} \| \{ `status`: `"empty"`; \} \| \{ `status`: `"invalidated"`; \}\>

Explicitly queries the latest completed picking frame at a canvas point.

This is the reliable choice for handling a native click at its exact
coordinates; it does not depend on a previous hover result.

The promise resolves with `"hit"`, `"empty"`, or `"invalidated"` when
the scene changed or the embed was finalized before the query completed.
It rejects when the active renderer does not support picking.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `point` | \{ `x`: `number`; `y`: `number`; \} |
| `point.x` | `number` |
| `point.y` | `number` |

#### Returns

`Promise`<\{ `status`: `"hit"`; `hit`: [`MarkHit`](MarkHit.md); \} \| \{ `status`: `"empty"`; \} \| \{ `status`: `"invalidated"`; \}\>
