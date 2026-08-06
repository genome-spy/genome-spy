# SVG export

This directory contains GenomeSpy Core's vector export implementation. The
subsystem is dynamically imported by `GenomeSpy.exportSvg()` so normal WebGL
rendering does not include it in the main bundle.

## Architecture

`index.js` creates an `SvgViewRenderingContext` and renders the prepared view
root through the normal view traversal. The context mirrors the view hierarchy
as nested `<g>` elements, manages shared definitions such as clip paths, masks,
filters, and hatch patterns, and collects deduplicated warnings.

Mark-specific conversion lives in `renderers/`. `renderers/index.js` maps mark
types to their SVG renderers. Renderers use the existing CPU encoders and
resolved scales, project instances into the current view coordinates, cull
invisible geometry, and emit editable SVG elements in draw order. SampleView
facet transforms are applied by the rendering context before mark emission.

Shared helpers include:

- `svgMarkUtils.js` for encoders, scale projection, inherited presentation
  attributes, and numeric formatting.
- `svgBounds.js` for clip-aware geometry and anchor culling.
- `markData.js` for selecting the collector batch of each rendered occurrence.
- `rectHatchPattern.js`, `linkArcFadeMask.js`, and `polygonUnion.js` for reusable
  definitions and specialized geometry.

## Behavior and scope

SVG export follows the current visualization state and returns `{ svg,
warnings }`. A renderer should warn when it can still emit useful basic
geometry after ignoring a property. It should throw with the mark type and view
path only when the mark cannot be represented meaningfully.

Presentation attributes that are constant for a mark belong on its group so
they inherit without CSS. Reusable visual definitions should be cached by the
rendering context. Coordinates are formatted to one decimal place because they
represent logical CSS pixels.

Rasterization is outside the current vector-only scope. Point fill gradients
are intentionally flattened, and the deprecated `geometricZoomBound` property
is not supported. Ordinary grammar faceting is also out of scope; SampleView
faceting is supported.

## Extending and testing

Add mark behavior to its renderer and keep focused tests beside it. Tests should
cover representative geometry, inherited constants, warnings, clipping and
culling, and SampleView projection when relevant. Shared helpers have tests in
this directory.

Run the SVG suite from the repository root:

```sh
npx vitest run packages/core/src/svg
```

The broader implementation status and remaining work are tracked in the
[SVG export plan](../../../../plans/svg-export/svg-export-plan.md).
