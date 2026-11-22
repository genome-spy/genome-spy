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

## Gradient legend brushing

An opacity condition can now consume a legend interval as a cell predicate. The
color scale uses all visible values, and the same raw brush range applies when a
HiGlass viewport loads a different resolution. A flat domain temporarily
prevents the legend from producing new bounds. Clearing the brush still works.

Core resolves the legend condition to one interval and two opacity values for
both renderers. WebGPU uploads those four values through a retained mark
property and compares the float32 cell in the fragment stage. Rounding bounds
upward preserves inclusive lower and exclusive upper comparisons between
representable values. Canvas adds that state to the bitmap cache key, so
dragging may recolor visible tiles on the CPU.

The ordinary row predicate looked for a scalar field on the tile record. A
dataflow filter would republish tiles during brushing and could change the color
domain. Spatial cell conditions still need their own projection semantics.

## Standalone WebGPU API

A tile is a draw instance for placement and a container for cell addresses. The
Core adapter uploads its edges in one packed vertex buffer and the named cell
inputs in a separate fragment buffer. A single field can upload its original
bits directly. Multiple fields are interleaved into one binding to keep the
number of GPU storage bindings independent of field count.

We considered expanding cells into ordinary rows and adding a texture per field.
Rows would repeat positions or IDs and increase CPU work on tile publication.
Separate textures would complicate formats and binding limits. The chosen split
keeps buffer writes tied to data publication and lets scales and selections
update independently. Empty snapshots and shared cell ranges are valid. The
implementation validates and packs both buffers before uploading a replacement.
Initial array identity does not tie edges together.

The Core gradient brush now writes the renderer's interval selection slot. It
can stay active over replacement tiles with a different resolution. MSA category
predicates on a strip's row use an explicit broadcast of the row ID into a cell
field. That broadcast costs an extra word per cell when used. Measure that case
on much larger alignments before introducing a separate storage representation.
Positional predicates on Core cells still need a grammar for how to project the
cell geometry.

A raster without active conditional ordering uses one draw. Active ordering
draws the tile geometry twice and tests the same raw cell predicate in each
pass. Each cell contributes to one pass, including when overlapping tiles are
translucent. Ordinary conditions use the fragment shader in the single draw. The
CPU and GPU may round blended RGBA8 values differently at half-unit boundaries,
so the compositing check tolerates one unit of quantization.

## Close-zoom raster precision

A large tile shifted the boundary by 32 pixels in a 512-pixel WebGPU view
spanning one base. Packed tile coordinates and single-word coordinates showed
the same drift. The shader now clips in target pixels and addresses the grid
from a nearby cell boundary projected in packed locus coordinates. The revision
also handles descending tile coordinates and tile widths above 2^32.

A Canvas crop that reduced the bitmap to the visible whole cells still shifted
the boundary because the destination remained huge. Drawing partial edge cells
into their visible destinations keeps both source texel bounds and destination
geometry stable. The interior stays a single bitmap draw.

## Raster antialiasing in WebGPU

Use the pixel footprint already available from the raster projection. Split each
axis at the nearest cell boundary and sample the midpoint of each part. Their
lengths give the weights. This integrates a footprint crossing one boundary
exactly and takes at most four color samples when zoomed out. Evaluate cell
conditions before filtering premultiplied RGBA.

Clamp the samples to the tile drawn at the pixel center and keep the existing
conditional order passes. This can leave visible seams between tiles or between
the two order passes. A few samples can still alias repeating patterns at strong
minification.

## Standalone raster simplification

Scalar cell fields already have a stable type and read expression when
`rasterData.js` binds the packed buffer. Carry that expression through channel
normalization and compilation as an internal fragment source. The ordinary
series manager continues to own per-instance attributes. Keep the authored
raster config, buffer ownership, scale slots, and tile replacement contract.
Verify both data-backed fill and opacity branches, ordinary series marks, and
the Core gradient and positional brushes.

Resolve named predicate inputs in the compiler that checks their types and emits
comparisons. Raster fields keep their authored names in predicates, with a
separate namespace for positions. Resolve point placement to an anchor in that
compiler. Preserve cell visibility, conditional order, and field names that also
name tile positions.

An independent fragment channel compiler would have duplicated scale and
selection logic. The existing compiler can use the fragment read expression
directly and let the series manager pack the tile attributes. The first round
removed 19 net runtime lines. The second removed 39 by resolving field names in
the existing predicate compiler and consolidating tile metadata validation.
Raster data preparation went from 325 to 249 lines.

The standalone GPU tests cover direct RGBA color, named field visibility,
categorical membership, cell ordering, and tile replacement. The Core WebGPU
raster tests cover positional brushing, gradient brushing, close locus zoom,
triangle placement, and picking.

WebGPU now uploads Float32 brush bounds in the same format for raster and
ordinary marks. The separate directed-rounding path supported brushes narrower
than the gap between adjacent Float32 values. The scratch removal lost that case
and passed the other six focused GPU tests. The Core gradient test now covers
the resulting boundary behavior. Packed locus brushes still compare their
high-precision grid edges. Removing the duplicate rounding path saved 37 net
production lines, for 95 across the simplification.

## Bounded raster axes

Each bounded raster axis uses one scale. Both endpoints keep their data
coordinates, and a band can specify a separate offset for its trailing edge. Use
the normal position scale implementations and expose one update slot per axis.
Core supplies endpoints and band offsets through the standalone contract. Verify
scale updates in the standalone images, close locus zoom, and sequence strips
that use categorical bands.

Cell visibility accepts selection predicates. The raster-specific scalar
comparisons had no example consumer. Keep the ordinary mark comparison
implementation for point semantic zoom. Tile placement still supports grouping
multiple tiles into one instanced draw.

A Chromium probe rendered 50,000 instances of a shared 4 × 4 RGBA tile in a 512
× 512 target. Both placement modes used one draw in a single view. Across 100
view rectangles, draw-time placement used 100 draws and per-tile placement used
one. Queue completion took about 1.1 ms in both 100-rectangle cases. This
measures resident data and excludes upload costs for distinct images.

Raster creation now uses the same `placementIndex` option as other marks. Core
supplies the shared draw-level option for repeated views. Standalone callers can
batch tiles with different view rectangles in one draw and replace the tile
indices with the geometry and cell data.

Raster tiles use grid bounds in all renderers. The renderer still computes a
nearby cell boundary for close locus zoom. An overlapping RGBA grid verifies
that transparent pixels expose the underlying Hi-C cell in picking.

## Vertical strips

A Core strip can bind either axis to a categorical band. The other axis binds to
a dimension in the tile record. The band contributes one cell to the tile shape.
A vertical strip is a one-column, row-major tile. Core normalizes both
orientations through the existing positional encoders and retains the existing
cell selection and picking contracts.

The raster browser suite checks categorical selection, band gaps, and index
placement for both orientations in WebGL2, Canvas2D, and WebGPU. The tooltip
test covers row indexing and genomic intervals in a one-column strip.

RasterMark rejects interval predicates targeting the strip's band axis. These
predicates previously compared raw labels on the CPU and internal category IDs
on WebGPU. Categorical membership still applies across the strip. Positional
predicates use the grid dimension for cell overlap.

Core raster position brushes use cell overlap. The mark rejects explicit
endpoint projections during opacity validation. Canvas2D and WebGL2 share the
cell range calculation. Standalone WebGPU uses overlap for position projections
and retains the ordinary hit-test modes for field projections.

The three SVG rasterizers share the export layout setup. Canvas2D and WebGPU use
one PNG crop helper, with GPU target ownership and readback kept in their
respective backends.
