[GenomeSpy Core API](../index.md) / RasterExportOptions

# Interface: RasterExportOptions

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

### mimeType?

> `optional` **mimeType?**: `"image/png"`

Output MIME type. __Default value:__ `"image/png"`

***

### pixelRatio?

> `optional` **pixelRatio?**: `number`

Physical image pixels per logical CSS pixel. Defaults to the device pixel ratio.
