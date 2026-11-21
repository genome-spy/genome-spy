[GenomeSpy Core API](../index.md) / SvgExportLayerInfo

# Interface: SvgExportLayerInfo

## Properties

### viewName

> **viewName**: `string`

Name of the UnitView that owns the mark.

***

### viewTitle?

> `optional` **viewTitle?**: `string`

Resolved title of the UnitView, when available.

***

### viewPath

> **viewPath**: `string`

Current path of the UnitView, for display and diagnostics only.

***

### markType

> **markType**: `string`

Mark type rendered by the layer.

***

### instanceCount

> **instanceCount**: `number`

Number of visible instances. For raster marks, counts tiles.

***

### requiresRasterization?

> `optional` **requiresRasterization?**: `true`

This layer is always embedded as an image.
