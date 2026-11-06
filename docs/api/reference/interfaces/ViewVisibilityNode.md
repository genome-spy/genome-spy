[GenomeSpy Core API](../index.md) / ViewVisibilityNode

# Interface: ViewVisibilityNode

One named view in a detached visibility snapshot.

## Properties

### selector

> **selector**: `ViewSelector`

Stable address within its import scope.

***

### title

> **title**: `string`

View title, falling back to its explicit name.

***

### visible

> **visible**: `boolean`

This view's own visibility choice, independently of its parents.

***

### effectiveVisible

> **effectiveVisible**: `boolean`

Whether this view and all its layout ancestors are shown.

***

### defaultVisible

> **defaultVisible**: `boolean`

Authored default, used by Restore defaults.

***

### configurable

> **configurable**: `boolean`

Whether host controls should offer a toggle; false also for ambiguous names.

***

### group?

> `optional` **group?**: `string`

Scoped identifier shared by mutually exclusive radio choices.

***

### children

> **children**: `ViewVisibilityNode`[]

Nested named views, including hidden descendants.
