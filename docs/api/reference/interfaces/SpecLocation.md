[GenomeSpy Core API](../index.md) / SpecLocation

# Interface: SpecLocation

A declaration identifier and property path within that declaration.

## Properties

### origin

> `readonly` **origin**: `string`

String returned by `EmbedOptions.getSpecOrigin`; Core does not interpret it.

***

### path?

> `readonly` `optional` **path?**: readonly (`string` \| `number`)[]

Property segments relative to the declaration, e.g. `["field"]` or `["expr"]`.
