# SVG export

This directory contains GenomeSpy Core's vector export implementation. The
subsystem is dynamically imported by `GenomeSpy.exportSvg()` so normal WebGL
rendering does not include it in the main bundle.

## Architecture

`index.js` creates an `SvgViewRenderingContext` and renders the prepared view
root through the normal view traversal. The context mirrors the view hierarchy
as nested `<g>` elements, manages shared definitions such as clip paths, masks,
filters, and hatch patterns, and collects deduplicated warnings. When optional
rasterization is enabled, a preliminary traversal counts post-culling mark
instances without creating instance elements.

Mark-specific conversion lives in `renderers/`. `renderers/index.js` maps mark
types to thin SVG emitters. Shared visitors in `../immediate/` use the
existing encoders and resolved scales to project, construct, and cull mark
geometry. SVG and Canvas2D consume those occurrences in draw order. SampleView
facet transforms are applied by each rendering context before mark emission.

Marks above the user-supplied `maxVectorInstances` threshold are collected into
maximal contiguous paint-order runs. The selected rendering backend may provide
a selective raster capability; otherwise Core tries the dynamically loaded
Canvas2D fallback. Each run is replayed into a transparent raster surface and
embedded as one cropped PNG. Adjacent SampleView marks and all of their sample
facets share the same image. SVG owns run selection, placeholders, bounds, and
document order. Raster backends only paint the selected marks and embed the
result.

Shared helpers include:

- `svgAttributes.js` for inherited presentation attributes.
- `svgNumber.js` for SVG numeric formatting.
- `../immediate/markEncoding.js` and `../immediate/bounds.js` for projection,
  property resolution, and clip-aware culling shared with Canvas2D.
- `../immediate/marks/` and `../immediate/geometry/` for collector traversal,
  mark projection, and shared geometry.
- `rectHatchPattern.js` and `linkArcFadeMask.js` for reusable SVG definitions.

## Behavior and scope

SVG export follows the current visualization state and returns `{ svg,
warnings }`. A renderer should warn when it can still emit useful basic
geometry after ignoring a property. It should throw with the mark type and view
path only when the mark cannot be represented meaningfully.

Presentation attributes that are constant for a mark belong on its group so
they inherit without CSS. Reusable visual definitions should be cached by the
rendering context. Coordinates are formatted to one decimal place because they
represent logical CSS pixels.

Rasterization is opt-in. Without a threshold—or without an available raster
backend—the exporter continues to produce a complete vector SVG. Unavailable
rasterization produces a warning rather than failing headless export. Point
fill gradients are intentionally flattened, and the deprecated
`geometricZoomBound` property is not supported. Ordinary grammar faceting is
also out of scope; SampleView faceting is supported.

`analyzeSvgExport()` performs only the count traversal and reports visible
layers with their post-culling instance counts. It does not emit mark elements
or load a raster backend. The App uses one cached analysis to preview threshold
changes in the Save SVG dialog.

## Extending and testing

Add mark behavior to its renderer and keep focused tests beside it. Tests should
cover representative geometry, inherited constants, warnings, clipping and
culling, and SampleView projection when relevant. Shared helpers have tests in
this directory.

Run the SVG suite from the repository root:

```sh
npx vitest run packages/core/src/rendering/svg
```
