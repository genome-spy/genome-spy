[GenomeSpy Core API](../index.md) / MarkEvent

# Interface: MarkEvent

A mark interaction event scoped to a `ViewHandle` subtree.

Mark activation performs picking at the event coordinates before invoking
the listener. GPU-backed picking can make delivery asynchronous, and the
callback is skipped when the scene or its owning view/embed is invalidated
before the pick completes. Marks configured with `tooltip: null` are not
pickable unless their view declares a point selection, which overrides that
opt-out; use `tooltip: false` to suppress tooltips while keeping a mark
interactive.

## Properties

### sourceEvent

> `readonly` **sourceEvent**: `MouseEvent`

Browser event that triggered the mark interaction.

***

### point

> `readonly` **point**: `object`

Canvas-relative CSS-pixel coordinates of the interaction.

#### x

> `readonly` **x**: `number`

#### y

> `readonly` **y**: `number`

***

### hit

> `readonly` **hit**: [`MarkHit`](MarkHit.md)

Mark and datum confirmed by the renderer's picking state.
