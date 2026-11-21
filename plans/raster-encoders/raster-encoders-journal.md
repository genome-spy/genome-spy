# Raster encoder and Canvas journal

## Dataflow

A raster record still supplies one set of positional encodings. The shared color
binding reads the field inside the tile and contributes cell values to the
existing scale resolution. A raster contribution has its own domain key so a
layered point mark can read a scalar field of the same name from the same
collector. The binding can read raw cells before the scale is built.

The immediate positional projector handles both dimensions and band placement.
It keeps the tile's original endpoints when it crosses a clip edge. Cropping the
endpoints before projecting the bitmap would stretch cells across the clipped
rectangle. Reversed axes use the signed width or height.

## Encoding and caching

Canvas caches colorized bitmaps by tile publication and color mapping. A
placement-only change can reuse the bitmap. Conditional opacity still runs
against each tile's record. WebGPU keeps packed cells and applies the mapping in
the shader.

We considered a shared color lookup table. Canvas currently uses the existing
Vega scale directly. That keeps the scope small and avoids a second mapping
implementation. CPU cost still grows with the total cells in visible tiles when
the color domain changes, including during animated domain transitions. If that
becomes a bottleneck, measure CPU colorization and bitmap allocation before
choosing a lookup table or deferring recoloring until navigation settles.

## Verification

Both renderers passed browser checks for shared locus placement, reversed
strips, categorical gaps, tile opacity, and reactive color changes. A Canvas
test covers viewport-driven log scaling, missing cells, and clipping through a
tile. Chrome rendered the live MSA example with shared label placement at both
alignment ends and loaded the HiGlass contact map at 16 kb and 4 kb resolutions.
Panning updated the color domain with the newly loaded tiles.
