[GenomeSpy Core API](../index.md) / SearchableView

# Interface: SearchableView

Search metadata, suitable for building a consumer-owned typeahead index.

## Properties

### view

> **view**: [`ViewHandle`](ViewHandle.md)

***

### title

> **title**: `string`

***

### description

> **description**: `string`

***

### fields

> **fields**: `object`[]

#### field

> **field**: `string`

#### description

> **description**: `string`

#### examples

> **examples**: `string`[]

***

### dataFields

> **dataFields**: `string`[]

Fields encountered while collecting examples; this is not a complete schema.

***

### source

> **source**: [`SearchSource`](SearchSource.md)
