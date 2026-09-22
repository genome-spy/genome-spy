[GenomeSpy Core API](../index.md) / ViewSliceAggregate

# Interface: ViewSliceAggregate

Exact operations reuse Core aggregate-transform numeric semantics.

## Properties

### op

> **op**: `"count"` \| `"valid"` \| `"sum"` \| `"min"` \| `"max"` \| `"mean"` \| `"variance"`

***

### field?

> `optional` **field?**: `string`

Required except for count. Supports the same field paths as aggregate transforms.

***

### as

> **as**: `string`

Unique result property.
