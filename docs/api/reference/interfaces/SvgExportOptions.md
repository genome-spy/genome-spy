[GenomeSpy Core API](../index.md) / SvgExportOptions

# Interface: SvgExportOptions

## Extends

- [`ImageExportOptions`](ImageExportOptions.md)

## Properties

### logicalWidth?

> `optional` **logicalWidth?**: `number`

Custom width in CSS pixels. Defaults to canvas width.

#### Inherited from

[`ImageExportOptions`](ImageExportOptions.md).[`logicalWidth`](ImageExportOptions.md#logicalwidth)

***

### logicalHeight?

> `optional` **logicalHeight?**: `number`

Custom height in CSS pixels. Defaults to canvas height.

#### Inherited from

[`ImageExportOptions`](ImageExportOptions.md).[`logicalHeight`](ImageExportOptions.md#logicalheight)

***

### background?

> `optional` **background?**: `string`

Overrides the visualization background. Null is transparent.

#### Inherited from

[`ImageExportOptions`](ImageExportOptions.md).[`background`](ImageExportOptions.md#background)

***

### rasterization?

> `optional` **rasterization?**: [`SvgRasterizationOptions`](SvgRasterizationOptions.md)

Rasterizes dense mark layers using an available rendering backend.
