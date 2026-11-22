# Raster cell tooltips

One datum remains one tile. Enable raster and icon tooltips explicitly with
`mark.tooltip: { "handler": "default" }` or a custom handler. Picking assigns
one ID per tile and tests the cell at the picking pixel center for coverage. The
hover retains the tile datum and carries a tile-local cell address. Build one
synthetic object of raw cell fields when the tooltip needs it. This is similar
to how
[deck.gl's BitmapLayer](https://deck.gl/docs/api-reference/layers/bitmap-layer)
reports pixel coordinates alongside the picked image. The implementation uses
GenomeSpy's existing picking infrastructure.

1. **Pick visible cells.** Keep the single-ID framebuffer and retained tile
   buffers. WebGL and WebGPU reuse their raster shaders' source coordinate and
   color functions to test the center cell before writing the tile ID. Canvas
   samples the same geometry and cell color mapping in its software picking
   buffer. Honor clip, tile opacity, missing data, RGBA alpha, and the legend
   brush. Cell picking represents the center of the pixel footprint. Display
   antialiasing continues to blend encoded colors at boundaries.
2. **Resolve and display the hit.** The interaction controller asks the active
   backend to resolve the tile hit against the final on-screen layout. Each
   backend supplies its picking sample position to the shared raster geometry
   resolver through its existing lazy-loaded factory. This keeps renderer
   geometry out of the minimal entrypoint and preserves reversed scales, clipped
   facets, and triangle coordinates. Tooltip context supplies the raw fields and
   genomic bin bounds, with both triangle intervals formatted using the shared x
   assembly. Include the cell index in hover identity. Existing point selections
   and mark events keep tile-level identity. SVG export stays on the ordinary
   rendering path.

Verify a HiGlass-shaped triangle at close locus zoom and an overlapping RGBA
icon with a transparent cell. Check hover updates within one tile, a second
visible mark beneath a masked cell, and rendering across all three backends. Run
the minimal bundle check to verify the renderer boundary. Update the HiGlass
triangle example and the branch's raster changeset.

Tentative commit `feat(core): show raster cell tooltips`.
