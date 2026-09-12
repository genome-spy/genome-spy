[GenomeSpy Core API](../index.md) / ImageExportApi

# Interface: ImageExportApi

Exports the current visualization as raster or vector images.

## Properties

### raster

> **raster**: (`options?`) => `Promise`<[`RasterExportResult`](RasterExportResult.md)\>

Exports a raster image through an available rendering backend. PNG is
currently the only supported format. Rejects if rasterization is
unavailable.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`RasterExportOptions`](RasterExportOptions.md) |

#### Returns

`Promise`<[`RasterExportResult`](RasterExportResult.md)\>

***

### svg

> **svg**: (`options?`) => `Promise`<[`SvgExportResult`](SvgExportResult.md)\>

Exports editable SVG arranged according to the view hierarchy.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`SvgExportOptions`](SvgExportOptions.md) |

#### Returns

`Promise`<[`SvgExportResult`](SvgExportResult.md)\>

***

### analyzeSvg

> **analyzeSvg**: (`options?`) => `Promise`<[`SvgExportAnalysis`](SvgExportAnalysis.md)\>

Counts visible SVG mark instances without creating an image.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`SvgExportAnalysisOptions`](SvgExportAnalysisOptions.md) |

#### Returns

`Promise`<[`SvgExportAnalysis`](SvgExportAnalysis.md)\>
