[GenomeSpy Core API](../index.md) / ZoomToOptions

# Interface: ZoomToOptions

## Properties

### duration?

> `optional` **duration?**: `number` \| `boolean`

Approximate transition duration. Zero or omitted zooms immediately.
Boolean `true` indicates a default duration.

***

### renderImmediately?

> `optional` **renderImmediately?**: `boolean`

Render immediately without scheduling an animation frame.

This is intended for synchronizing multiple GenomeSpy instances, where
the target view should be redrawn during the same animation frame as the
source view. Use it only for zero-duration zooms. It is not supported for
animated transitions and may do redundant work if several domains are
applied before the browser has a chance to paint.
