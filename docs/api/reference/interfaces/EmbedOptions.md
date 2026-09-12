[GenomeSpy Core API](../index.md) / EmbedOptions

# Interface: EmbedOptions

## Properties

### renderer?

> `optional` **renderer?**: `"auto"` \| `"webgl"` \| `"canvas"` \| `"webgpu"`

Rendering backend. `"auto"` uses WebGL2 when available and falls back to
the Canvas2D compatibility renderer. `"webgpu"` enables an experimental
proof-of-concept renderer for a narrow subset of marks. `"canvas"` does
not request WebGL or WebGPU and uses software-based datum picking.

__Default value:__ `"auto"`

***

### namedDataProvider?

> `optional` **namedDataProvider?**: (`name`) => `any`[]

A function that allows retrieval of named data. There are two ways to provide named data:
1. A data provider (this)
2. Explicit updates using the `updateNamedData` method (the other).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

#### Returns

`any`[]

#### Deprecated

Declare the dataset in the owning view and provide initial
rows through the specification or update it through
`EmbedResult.datasets.set()` for a top-level declaration or
`ViewHandle.datasets.set()` for a nested declaration.

***

### tooltipHandlers?

> `optional` **tooltipHandlers?**: `Record`<`string`, `TooltipHandler`\>

Custom tooltip handlers. Use `"default"` to override the default handler

***

### inputBindingContainer?

> `optional` **inputBindingContainer?**: `HTMLElement` \| `"none"` \| `"default"`

Where to put the input binding elements. The default is `"default"`, which means that
the input binding elements are placed in the same container as the GenomeSpy instance.

***

### powerPreference?

> `optional` **powerPreference?**: `"default"` \| `"high-performance"` \| `"low-power"`

A suggestion for the browser on the appropriate GPU setup for the WebGL
environment. This setting has no effect in Canvas2D mode.

__Default value:__ `"default"` in `@genome-spy/core` and
`"high-performance"` in `@genome-spy/app`

***

### theme?

> `optional` **theme?**: `GenomeSpyConfig`

Optional theme configuration object that is merged after the internal
defaults and built-in theme, but before `spec.config`.

***

### onError?

> `optional` **onError?**: (`error`, `container`) => `boolean` \| `void`

Optional hook for handling launch errors. Return true to suppress default UI.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `error` | `unknown` |
| `container` | `HTMLElement` |

#### Returns

`boolean` \| `void`
