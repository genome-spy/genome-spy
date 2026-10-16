[GenomeSpy Core API](../index.md) / PointSelectionApi

# Interface: PointSelectionApi

Capability for reading and setting a row-backed point selection.

Point selections identify data records independently of their mark type.
Set membership by keys declared in the source unit view's `encoding.key`.

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

### setValue

> **setValue**: (`keys`) => `void`

Replaces membership with records resolved from the unit view used to get
this handle. Each tuple follows encoding.key field order, including one
element for a single field. An empty array clears the selection.

Requires ready loaded transformed data and unique, non-null scalar keys.
Missing/ambiguous keys or multiple tuples for toggle:false throw without
changing membership. No data is fetched and keys are not rebound after
source replacement. Reapply the setter to select newly published records.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `keys` | readonly readonly `Scalar`[][] |

#### Returns

`void`

***

### clear

> **clear**: () => `void`

Clears the selection and publishes the cleared state when it changed.

#### Returns

`void`
