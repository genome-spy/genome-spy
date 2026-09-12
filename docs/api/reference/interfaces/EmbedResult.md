[GenomeSpy Core API](../index.md) / EmbedResult

# Interface: EmbedResult

An API for controlling the embedded GenomeSpy instance.

## Properties

### views

> **views**: [`ViewApi`](ViewApi.md)

Inspects and controls the live view hierarchy.

***

### datasets

> `readonly` **datasets**: [`DatasetApi`](DatasetApi.md)

Updates datasets declared by the top-level input specification.

The dataset must be declared in that specification's `datasets`
property.

This namespace is unaffected by implicit layout wrappers and does not
search nested views.

***

### events

> `readonly` **events**: [`EmbedEventApi`](EmbedEventApi.md)

Synchronous native input subscriptions for the embedded canvas.

***

### params

> `readonly` **params**: [`ParamNamespace`](ParamNamespace.md)

Parameters and selections resolved from the authored top-level scope.

***

### imageExport

> `readonly` **imageExport**: [`ImageExportApi`](ImageExportApi.md)

Exports the current visualization as raster or vector images.

***

### debug

> **debug**: [`EmbedDebugApi`](EmbedDebugApi.md)

Developer-only hooks for optional runtime inspection tools.

***

### finalize

> **finalize**: () => `void`

Releases all resources and unregisters event listeners, etc.

#### Returns

`void`

***

### addEventListener

> **addEventListener**: (`type`, `listener`) => `void`

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | `string` |
| `listener` | (`event`) => `void` |

#### Returns

`void`

#### Deprecated

Use `EmbedResult.events.subscribe()` and its returned cleanup
function.

Adds an event listener, which is called when the user interacts with a mark
instance. Currently, only `"click"` events are supported. The callback receives
an event object as its first (and only) parameter. Its `datum` property
contains the datum that the user interacted with.

***

### removeEventListener

> **removeEventListener**: (`type`, `listener`) => `void`

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | `string` |
| `listener` | (`event`) => `void` |

#### Returns

`void`

#### Deprecated

Use the cleanup function returned by
`EmbedResult.events.subscribe()`.

Removes a registered event listener.

***

### getScaleResolutionByName

> **getScaleResolutionByName**: (`name`) => [`ScaleResolutionApi`](ScaleResolutionApi.md)

Returns a named `ScaleResolution` object that allows for attaching event
listeners and controlling the scale domain. Returns `undefined` when the
name is not registered.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

#### Returns

[`ScaleResolutionApi`](ScaleResolutionApi.md)

***

### getParam

> **getParam**: <`T`\>(`name`) => [`ParamApi`](ParamApi.md)<`T`\>

Returns a handle for reading, writing, and subscribing to a named
parameter.

Parameters are addressed by name only. If the name resolves to multiple
independent parameters, this method throws an ambiguity error. Parameters
declared with `push: "outer"` are treated as aliases of the outer
parameter they write to.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` | [`ParamValue`](../type-aliases/ParamValue.md) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

#### Returns

[`ParamApi`](ParamApi.md)<`T`\>

***

### awaitVisibleLazyData

> **awaitVisibleLazyData**: (`signal?`) => `Promise`<`void`\>

Waits until lazy data sources have loaded data for the current visible
positional domain.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `signal?` | `AbortSignal` |

#### Returns

`Promise`<`void`\>

***

### updateNamedData

> **updateNamedData**: (`name`, `data?`) => `void`

Updates a named dataset

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | `string` | data source to update |
| `data?` | `any`[] | new data. If left undefined, the data is retrieved from a provider. |

#### Returns

`void`

#### Deprecated

Use `EmbedResult.datasets` for a top-level declaration or
`ViewHandle.datasets` for a nested declaration.

***

### getRenderedBounds

> **getRenderedBounds**: () => `object`

Returns the bounds reached by the last rendered layout in CSS pixels.

#### Returns

`object`

##### width

> **width**: `number`

##### height

> **height**: `number`

***

### getLogicalCanvasSize

> **getLogicalCanvasSize**: () => `object`

Returns the current logical canvas size in CSS pixels.

#### Returns

`object`

##### width

> **width**: `number`

##### height

> **height**: `number`

***

### exportCanvas

> **exportCanvas**: (`logicalWidth?`, `logicalHeight?`, `devicePixelRatio?`, `clearColor?`) => `string`

Returns a PNG data URL of the current canvas.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `logicalWidth?` | `number` | Custom width, defaults to canvas width |
| `logicalHeight?` | `number` | Custom height, defaults to canvas height |
| `devicePixelRatio?` | `number` | Defaults to window.devicePixelRatio |
| `clearColor?` | `string` | Background color. A CSS color, null for transparent |

#### Returns

`string`

A PNG data URL

#### Deprecated

Use `imageExport.raster()` instead.
