[GenomeSpy Core API](../index.md) / SvgExportResult

# Interface: SvgExportResult

## Properties

### blob

> **blob**: `Blob`

The exported SVG document.

***

### warnings

> **warnings**: `string`[]

Unsupported properties that were ignored during export.

***

### rasterized

> **rasterized**: [`SvgRasterizationInfo`](SvgRasterizationInfo.md)[]

Raster images embedded in the SVG, in paint order.
