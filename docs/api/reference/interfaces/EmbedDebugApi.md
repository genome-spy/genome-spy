[GenomeSpy Core API](../index.md) / EmbedDebugApi

# Interface: EmbedDebugApi

Developer-only hooks for optional runtime inspection tools.

These hooks expose internal runtime objects and are not intended for normal
visualization control or persisted application state.

## Properties

### getViewRoot

> **getViewRoot**: () => `object`

Returns the internal root view for optional developer tooling.

#### Returns

`object`

***

### getModules

> **getModules**: () => `Promise`<`__module`\>

Loads Core debug helpers from the same runtime that owns the view tree.

#### Returns

`Promise`<`__module`\>

***

### createPickingBufferVisualization?

> `optional` **createPickingBufferVisualization?**: () => `HTMLCanvasElement`

Creates a detached logical-pixel visualization of the Canvas software
picking IDs. Available only in Core embeds using the Canvas renderer.

#### Returns

`HTMLCanvasElement`
