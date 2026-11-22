# Raster conditional opacity

Raster opacity conditions select cells. A tile supplies the cell grid and values
and remains the unit of dataflow, caching, and upload.

## Contract

- Use the existing `opacity.condition` grammar. Keep branch precedence, value
  expressions, named predicates, Boolean composition, active and empty tests,
  and interval hit tests. Resolve color and position through the normal Core
  selection predicate machinery.
- Evaluate a color projection against the raw cell value and a positional
  projection against the cell's data-space bounds. A strip's band coordinate and
  an icon's anchor are point-like data coordinates. Keep packed locus
  comparisons precise on WebGPU.
- Cell opacity is applied before color-space antialiasing and is shared by
  drawing and picking. SVG continues to embed rasterized cells.
- This change concerns opacity conditions. Conditional grid placement and color
  encodings, draw order in Core, and cell identities for point selections need
  separate contracts.

## Implementation

1. Lower resolved opacity predicates to cell projections. Use Core's interval
   evaluator for CPU paths. Reuse it in Canvas bitmaps and picking and use a
   cached per-tile alpha map for WebGL. Cache by current predicate/value state
   so ordinary redraws can reuse the map. Keep color mapping on the GPU.
2. In the standalone WebGPU raster, allow an explicit projection input to
   address a derived grid boundary. Generate those boundaries in the fragment
   shader from tile endpoints and cell indices, and reuse the renderer's
   existing predicate and conditional channel machinery. The Core adapter passes
   its resolved projections. Brush updates use selection uniforms and leave tile
   and cell buffers intact.
3. Show two public, registered Schwarzer et al. contact maps with shared locus
   and log color scales. Put ΔNipbl inside a draggable brush and wild type
   outside. Use an inset brush edge so the contact values stay visible.

## Verification

Check the assembled spec for an empty brush, moving x/y bounds through a tile,
high-precision locus boundaries, Boolean conditions and ordered branches, and a
color-legend condition. Verify that a masked cell cannot receive a tooltip or
picking hit and that WebGL, Canvas, WebGPU, and hybrid SVG agree where they
share the same sampling geometry. Run the live mm9 lens on the public tiles.

The standalone renderer's explicit cell fields and GPU color scaling are
retained. No coordinate copies are needed for the WebGPU lens. Measure the
browser interaction before adding a more complex WebGL mask path.
