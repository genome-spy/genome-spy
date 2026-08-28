# Canvas2D renderer

This directory contains GenomeSpy Core's compatibility renderer for browsers
and virtual desktops where WebGL2 is unavailable. `../registerCanvas.js`
registers its dynamically imported live and raster capabilities. Normal WebGL
rendering does not include it in the synchronous ESM entry bundle, while the
minimal entrypoint omits it entirely unless explicitly enabled. The single-file
UMD distribution still inlines optional modules.

## Architecture

`index.js` creates the live surface and exposes Canvas-specific raster export
through the rendering-backend boundary. `Canvas2DRenderCoordinator` runs the
normal layout and view traversal. `Canvas2DViewRenderingContext` applies view
coordinates, clipping, SampleView facet projection, and immediate mark drawing.

Live rendering and detached PNG export share `renderCanvas2D.js`. Both clear
and repaint the full surface in draw order; there is no retained scene graph or
dirty-region cache. The export path creates a detached canvas at the requested
logical size and pixel ratio, renders once, and encodes it with `toBlob()`.

Mark projection, geometry, and culling live in `../immediate/` and are
shared with SVG export. Files under `renderers/` only translate the normalized
mark occurrences into Canvas state, paths, text, and paint operations. Keep new
immediate-mode geometry in the shared visitors rather than copying it into a
Canvas emitter. The immediate layer has no Canvas2D, SVG, WebGL, or WebGPU
dependencies.

## Interaction and limitations

Canvas2D uses the same view and scale interaction dispatcher as WebGL, so
coordinate-based zooming, panning, scrolling, and other view interactions work.
It deliberately has no picking surface or framebuffer readback. Datum hover,
data tooltips, datum clicks, and point-selection hit testing are therefore
disabled.

Canvas text uses native browser fonts and antialiasing. Some specialized mark
effects are approximated or ignored with a deduplicated warning. Keep these
fallbacks explicit and useful; fail only when a mark cannot be represented
meaningfully.

## Software picking primitives

`picking/` contains the DOM-independent integer coverage primitives used by the
Canvas software picker. `SoftwarePickingBuffer` stores one unsigned datum ID per
floored logical CSS pixel; it never scales storage by device pixel ratio. A
fractional strip narrower than one CSS pixel at the right or bottom edge is
intentionally outside the picking surface.

The rasterizer supports clipped row spans, conservative square footprints,
thick segments, convex polygons, and adaptively flattened cubic Bézier curves.
It writes IDs directly in painter order without colors, alpha, blending, or
antialiasing. `pickingColorizer.js` maps those IDs to opaque diagnostic colors,
but picking never decodes the colors. Keep this primitive layer independent of
Canvas and DOM APIs.

## Extending and testing

Keep Canvas implementation modules behind the dynamic import in
`../renderingBackend.js`. Use command-recording Vitest contexts for
stable geometry and state assertions, and real Chromium for PNG decoding,
interaction smoke tests, and performance measurements. Do not add a Node
Canvas dependency solely for unit tests.
