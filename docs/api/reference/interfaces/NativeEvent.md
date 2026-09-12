[GenomeSpy Core API](../index.md) / NativeEvent

# Interface: NativeEvent

Native input delivered before GenomeSpy handles an event. The listener is
synchronous; call `sourceEvent.preventDefault()` here when browser-level
cancellation is required. Use mark subscriptions for work that may await
picking.

The point uses CSS-pixel coordinates relative to the embedded canvas. Calling
`preventViewDefault()` vetoes Core's default interaction while leaving
browser-level cancellation to `sourceEvent.preventDefault()`. Use this API
for input at the canvas level; use `ViewHandle.marks` for interactions tied
to a picked mark.

## Properties

### sourceEvent

> `readonly` **sourceEvent**: `Event`

Browser event that triggered the input.

***

### point

> `readonly` **point**: `object`

Canvas-relative CSS-pixel coordinates of the input event.

#### x

> `readonly` **x**: `number`

#### y

> `readonly` **y**: `number`

***

### preventViewDefault

> **preventViewDefault**: () => `void`

Prevents GenomeSpy's default handling of this input event.

#### Returns

`void`
