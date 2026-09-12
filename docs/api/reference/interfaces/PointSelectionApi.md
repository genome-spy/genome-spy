[GenomeSpy Core API](../index.md) / PointSelectionApi

# Interface: PointSelectionApi

Capability for reading and clearing a row-backed point selection.

Point selections are exposed as detached snapshots. Use `clear()` to empty
the selection; writes through this capability are not supported.

`"commit"` is accepted for future gesture-based point selections, such as a
lasso. For the current point-selection implementation, it has the same
delivery behavior as `"change"`.

## Properties

### type

> `readonly` **type**: `"point"`

Discriminator for this selection capability.

***

### getValue

> **getValue**: () => [`PointSnapshot`](PointSnapshot.md)

Returns the current detached selection snapshot.

#### Returns

[`PointSnapshot`](PointSnapshot.md)

***

### subscribe

> **subscribe**: (`listener`, `options?`) => () => `void`

Subscribes to future selection updates and returns an unsubscribe
function. Delivery defaults to every change; `"commit"` is accepted for
symmetry with interval selections and follows the point selection's
normal update delivery.

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
