[GenomeSpy Core API](../index.md) / FontCatalogEntry

# Interface: FontCatalogEntry

One exact TrueType face available to the WebGPU renderer.

## Properties

### family

> **family**: `string`

Font-family name used by the visualization specification.

***

### source

> **source**: `string` \| `URL`

URL of a browser-fetchable TrueType (`.ttf`) font.

***

### weight?

> `optional` **weight?**: `number`

CSS-like numeric font weight.

__Default value:__ `400`

***

### style?

> `optional` **style?**: `"normal"` \| `"italic"`

Font style.

__Default value:__ `"normal"`
