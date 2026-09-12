[GenomeSpy Core API](../index.md) / ViewApi

# Interface: ViewApi

API for inspecting and mutating the live layout hierarchy.

The hierarchy model matches the layout tree derived from the visualization
spec. The API addresses view nodes such as unit, layer, concat, and grid
views, plus implicit layout containers that GenomeSpy may add at the root.
It does not address rendered marks, guide primitives, DOM nodes, or other
internal implementation objects.

Mutations are asynchronous because view creation, imports, dataflow
initialization, data loading, guide rebuilding, and layout updates may all be
involved. Mutation promises resolve when the operation-specific lifecycle has
completed.

## Properties

### root

> **root**: () => [`ViewHandle`](ViewHandle.md)

Returns a handle to the root layout view.

The root may be an implicit layout container rather than the top-level
view declared by the input spec.

#### Returns

[`ViewHandle`](ViewHandle.md)

***

### resolve

> **resolve**: (`address`) => [`ViewHandle`](ViewHandle.md)

Resolves an address to a live view handle.

Selectors resolve the current matching authored view. A selector that is
missing or ambiguous, or a handle that no longer refers to a live view,
returns `undefined`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `address` | [`ViewAddress`](../type-aliases/ViewAddress.md) |

#### Returns

[`ViewHandle`](ViewHandle.md)

***

### get

> **get**: (`address`) => [`ViewHandle`](ViewHandle.md)

Resolves an address to a live view handle.

Throws if the address cannot be resolved, is ambiguous, or if a handle no
longer refers to a live view.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `address` | [`ViewAddress`](../type-aliases/ViewAddress.md) |

#### Returns

[`ViewHandle`](ViewHandle.md)

***

### getLayoutBounds

> **getLayoutBounds**: (`address`) => [`ViewLayoutBounds`](ViewLayoutBounds.md)

Returns the last rendered layout bounds for a view.

Bounds are returned in CSS pixels in the embedded GenomeSpy canvas
coordinate space. Returns `undefined` if the address is unresolved, the
view is no longer live, or the view has not been rendered yet.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `address` | [`ViewAddress`](../type-aliases/ViewAddress.md) |

#### Returns

[`ViewLayoutBounds`](ViewLayoutBounds.md)

***

### subscribeToLayout

> **subscribeToLayout**: (`listener`) => () => `void`

Subscribes to completed layout updates.

The listener is called after a layout/render pass has updated view
bounds. Returns an unsubscribe function.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `listener` | () => `void` |

#### Returns

() => `void`

***

### insert

> **insert**: (`parent`, `spec`, `options?`) => `Promise`<[`ViewHandle`](ViewHandle.md)\>

Inserts a new child view or subtree under a mutable container view.

The `spec` can be an ordinary view spec or an import spec. Use
`options.scope` to give the inserted instance a selector scope, allowing
the same spec to be inserted multiple times and addressed independently.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `parent` | [`ViewAddress`](../type-aliases/ViewAddress.md) |
| `spec` | `ViewSpec` \| `ImportSpec` |
| `options?` | [`InsertViewOptions`](InsertViewOptions.md) |

#### Returns

`Promise`<[`ViewHandle`](ViewHandle.md)\>

***

### remove

> **remove**: (`target`) => `Promise`<`void`\>

Removes a view and disposes its subtree.

Removing the root view is not supported.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `target` | [`ViewAddress`](../type-aliases/ViewAddress.md) |

#### Returns

`Promise`<`void`\>

***

### move

> **move**: (`target`, `options`) => `Promise`<[`ViewHandle`](ViewHandle.md)\>

Reorders a view within its current parent container.

`options.index` is the destination index after temporarily removing the
target from its current position.

Moving a view to another branch of the hierarchy is not supported.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `target` | [`ViewAddress`](../type-aliases/ViewAddress.md) |
| `options` | [`MoveViewOptions`](MoveViewOptions.md) |

#### Returns

`Promise`<[`ViewHandle`](ViewHandle.md)\>

***

### transaction

> **transaction**: <`T`\>(`callback`) => `Promise`<`T`\>

Runs multiple mutations as one ordered transaction.

Implementations may defer layout and rendering work until the callback
has completed.

#### Type Parameters

| Type Parameter |
| ------ |
| `T` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `callback` | (`views`) => `T` \| `Promise`<`T`\> |

#### Returns

`Promise`<`T`\>
