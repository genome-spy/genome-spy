[GenomeSpy Core API](../index.md) / RecordPointSelectionApi

# Interface: RecordPointSelectionApi

Capability for reading, replacing, and clearing a row-backed point selection.

Point selections identify records independently of their mark type. Obtain
this capability through a source unit view to replace membership by key.

`"commit"` is accepted for future gesture-based point selections, such as a
lasso. For the current point-selection implementation, it has the same
delivery behavior as `"change"`.

## Properties

### type

> `readonly` **type**: `"point"`

Discriminator for this selection capability.

***

### membership

> `readonly` **membership**: `"records"`

***

### getValue

> **getValue**: () => [`RecordPointSnapshot`](RecordPointSnapshot.md)

Returns the current detached selection snapshot.

#### Returns

[`RecordPointSnapshot`](RecordPointSnapshot.md)

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

Replaces membership using tuples in the source unit's encoding.key order.
Requires ready loaded records and unique keys. Invalid, missing, or
ambiguous keys reject the whole write; single selections accept at most
one tuple. Empty input clears without requiring data or encoding.key.
Membership refers to the current publication; clear/reapply after updates.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `keys` | readonly (readonly `Scalar`[])[] |

#### Returns

`void`

***

### clear

> **clear**: () => `void`

Clears the selection and publishes the cleared state when it changed.

#### Returns

`void`
