[GenomeSpy Core API](../index.md) / IntervalSelectionApi

# Interface: IntervalSelectionApi

Capability for reading, clearing, and testing membership in an interval
selection.

## Properties

### type

> `readonly` **type**: `"interval"`

Discriminator for this selection capability.

***

### getValue

> **getValue**: () => [`IntervalSnapshot`](IntervalSnapshot.md)

Returns the current detached selection snapshot.

#### Returns

[`IntervalSnapshot`](IntervalSnapshot.md)

***

### subscribe

> **subscribe**: (`listener`, `options?`) => () => `void`

Subscribes to future selection updates and returns an unsubscribe
function. Delivery defaults to every change; `"commit"` reports a
completed brush or a committed programmatic update.

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

Clears the selection and publishes the cleared state when it changed.

#### Returns

`void`

***

### contains

> **contains**: (`point`) => `boolean`

Tests whether a canvas point is inside the current interval selection.
Coordinates are CSS pixels relative to the embedded GenomeSpy canvas.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `point` | \{ `x`: `number`; `y`: `number`; \} |
| `point.x` | `number` |
| `point.y` | `number` |

#### Returns

`boolean`
