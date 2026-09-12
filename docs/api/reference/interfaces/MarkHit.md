[GenomeSpy Core API](../index.md) / MarkHit

# Interface: MarkHit

A mark hit from the current rendered scene.

The datum is a detached shallow copy. Nested values are not cloned.

## Properties

### view

> `readonly` **view**: [`ViewHandle`](ViewHandle.md)

Handle for the unit view that owns the mark.

***

### uniqueId

> `readonly` **uniqueId**: `number`

Picking identifier for the mark in the current rendered scene.

***

### datum

> `readonly` **datum**: `Readonly`<`Record`<`string`, `unknown`\>\>

Data row associated with the mark, without the internal picking id.
