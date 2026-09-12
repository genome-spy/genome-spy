[GenomeSpy Core API](../index.md) / SvgRasterizationInfo

# Interface: SvgRasterizationInfo

## Properties

### targets

> **targets**: [`SvgRasterizationTargetInfo`](SvgRasterizationTargetInfo.md)[]

Contiguous mark layers combined into this raster image.

***

### reason

> **reason**: `"instance-threshold"`

Why the layers were rasterized.

***

### maxVectorInstances

> **maxVectorInstances**: `number`

Threshold used for this export.

***

### pixelRatio

> **pixelRatio**: `number`

Physical raster pixels per logical SVG pixel.
