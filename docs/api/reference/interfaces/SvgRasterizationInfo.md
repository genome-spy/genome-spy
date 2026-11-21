[GenomeSpy Core API](../index.md) / SvgRasterizationInfo

# Interface: SvgRasterizationInfo

## Properties

### targets

> **targets**: [`SvgRasterizationTargetInfo`](SvgRasterizationTargetInfo.md)[]

Contiguous mark layers combined into this raster image.

***

### reason

> **reason**: `"raster-mark"` \| `"instance-threshold"`

Raster-mark runs contain a raster layer that requires a bitmap.

***

### maxVectorInstances?

> `optional` **maxVectorInstances?**: `number`

Threshold used for optional rasterization, when configured.

***

### pixelRatio

> **pixelRatio**: `number`

Physical raster pixels per logical SVG pixel.
