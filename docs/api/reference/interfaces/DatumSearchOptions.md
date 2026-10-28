[GenomeSpy Core API](../index.md) / DatumSearchOptions

# Interface: DatumSearchOptions

## Properties

### limit

> **limit**: `number`

Global result bound, applied after matching and optional target filtering.

***

### view?

> `optional` **view?**: [`ViewHandle`](ViewHandle.md)

A live unit or container subtree belonging to this embed.

***

### field?

> `optional` **field?**: `string`

Restrict matching to this declared field; skip other views.

***

### mode?

> `optional` **mode?**: `"exact"` \| `"prefix"`

***

### target?

> `optional` **target?**: `"zoomable"`

Require at least one zoomable record-derived target before applying limit.
