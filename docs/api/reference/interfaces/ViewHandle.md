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

### id

> `readonly` **id**: `string`

Runtime-stable id for this handle.

The id is stable only for the current embedded instance. It is not a
bookmark or serialization format.

***

### name

> `readonly` **name**: `string`

Explicit view name, if the view has one.

***

### selector

> `readonly` **selector**: `ViewSelector`

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

> **parent**: () => `ViewHandle`

Returns a handle to the layout parent, if the view has one.

#### Returns

`ViewHandle`

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
