[GenomeSpy Core API](../index.md) / ViewHandle

# Interface: ViewHandle

Live handle to a view in the embedded GenomeSpy instance.

The exposed hierarchy matches the layout tree derived from the
visualization spec: unit views and container views are represented as view
handles, and child order is the layout order declared by the spec.
GenomeSpy may add an implicit root layout container, for example when a
root unit view needs space for axes, titles, or other guides.

Handles are opaque public references to one concrete view instance. They do
not expose internal `View` objects, are not bookmark or serialization
formats, and should not be reused after `isAlive()` becomes false. Methods
on a stale handle also fail rather than silently operating on another view.

## Properties

### describe

> **describe**: () => [`ViewDescription`](ViewDescription.md)

Returns detached metadata. Throws for a removed view or finalized embed.

#### Returns

[`ViewDescription`](ViewDescription.md)

***

### readData

> **readData**: (`options`) => [`ViewDataReadResult`](ViewDataReadResult.md)

Returns a bounded detached read from one ready unit view with at most one facet batch.
Throws for unready data, containers, removed views, finalized embeds,
multiple facet batches, non-cloneable returned values, or shared memory.
The row bound does not bound the size of an individual nested datum.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`ViewDataReadOptions`](ViewDataReadOptions.md) |

#### Returns

[`ViewDataReadResult`](ViewDataReadResult.md)

***

### getScaleResolution

> **getScaleResolution**: (`channel`) => [`ScaleResolutionApi`](ScaleResolutionApi.md) \| `undefined`

Returns the resolved positional scale, including unnamed scales, or undefined if absent.
Throws for invalid channels, removed views, or finalized embeds.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `channel` | `"x"` \| `"y"` |

#### Returns

[`ScaleResolutionApi`](ScaleResolutionApi.md) \| `undefined`

***

### id

> `readonly` **id**: `string`

Runtime-stable id for this handle.

The id is stable only for the current embedded instance. It is not a
bookmark or serialization format.

***

### name

> `readonly` **name**: `string` \| `undefined`

Explicit view name, if the view has one.

***

### selector

> `readonly` **selector**: `ViewSelector` \| `undefined`

Selector for this view, if the view is addressable by selector.

***

### type

> `readonly` **type**: [`ViewHandleType`](../type-aliases/ViewHandleType.md)

Public view kind.

***

### isAlive

> **isAlive**: () => `boolean`

Returns whether the referenced view is still part of the live hierarchy.

#### Returns

`boolean`

***

### parent

> **parent**: () => `ViewHandle` \| `undefined`

Returns a handle to the layout parent, if the view has one.

#### Returns

`ViewHandle` \| `undefined`

***

### children

> **children**: () => `ViewHandle`[]

Returns handles for the current layout child views in spec order.

#### Returns

`ViewHandle`[]

***

### datasets

> `readonly` **datasets**: [`DatasetApi`](DatasetApi.md)

Updates datasets declared by this exact view.

***

### params

> `readonly` **params**: [`ParamNamespace`](ParamNamespace.md)

Parameters and selections resolved from this view's lexical scope.

***

### marks

> `readonly` **marks**: [`MarksApi`](MarksApi.md)

Mark interaction and picking scoped to this view's subtree.
