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
   evaluator in Canvas bitmaps and software picking. Cache masks by predicate
   and tile state so ordinary redraws can reuse the result.
2. In the standalone WebGPU raster, use position projections for cell bounds
   and input projections for named data fields. Resolve both through the same
   selection slots and comparison functions. The Core adapter translates its
   resolved projections and supplies actual tile edges.
3. Show two public, registered Schwarzer et al. contact maps with shared locus
   and log color scales. Put wild type inside a draggable brush and ΔNipbl
   outside. Use a transparent brush with an outline.

## WebGPU simplification

Keep Core's resolved interval components and data-space bounds. The standalone
raster distinguishes a cell position projection from a named field projection.
Use the same predicates for fill, opacity, visibility, and conditional order.
Channel branches, selection state, and field comparisons keep their existing
implementation. Remove the raster mark's derived-input configuration.

The raster shader computes the sampled cell's bounds from the same tile
endpoints it uses for layout. Index strips send an exclusive end to the
renderer while keeping the inclusive data extent used by Core for domain
inference. For icon positions the projection tests the anchor. Keep packed
locus precision and brush updates through the existing selection uniforms.

The range-table prototype added roughly 160 source lines. It required a
separate storage buffer, copied bounds and tile positions, and update hooks
for tile replacement, selection changes, and dynamic anchors. The shader
approach shares the normal interval code and removes synthetic inputs and
raster-specific configuration. It retains the per-sample geometry comparison.

Tentative commit: `refactor(webgpu): address raster cell positions in interval predicates`.

## WebGL mask replacement

Generate raster opacity from the existing GLSL Boolean emitter and ordered
branches. Read raw values from the cell texture, and bind each positional
projection to a half-open range of grid indices. Compute that range from the
exact data-space edges during the existing visible-tile draw, so zoom and
screen reversal do not affect membership. Icons and strip band coordinates
test their tile anchor. Keep a selection's activity separate from whether its
range intersects a particular tile. Round float color thresholds upward to
match the host's half-open point test.

Categorical color projections reuse WebGL's integer set texture and palette
codes. Categorical anchors can be evaluated per tile. Read current parameters
during render preparation. Preserve branch precedence, unset parameters, and
the empty policy, including in Boolean compositions. Use the same shader
opacity for visible rendering, picking, and hybrid SVG. Delete WebGL's dense
mask texture, revision, and upload code.

Verify the live lens, the gradient legend (including between-float bounds),
categorical opacity, and positional endpoint projections. Record the net
production code after deleting the old path.

Tentative commit: `refactor(core): evaluate raster opacity in WebGL`.

## Canvas drawing and picking

Keep opacity branch validation and metadata on `RasterMark`. Resolve the
branches as spans inside the Canvas backend and apply them while writing each
tile's pixels. Cache the painted result by tile data, scale mapping, and opacity
state. Keep the final alpha bytes for pickable marks so software picking uses
the same transparency as drawing, including RGBA data and rounding. GPU
backends continue to evaluate opacity in their own shaders.

Check Canvas picking for both grid cells gated by a brush and direct RGBA
pixels. Verify that loading the WebGL backend does not load the Canvas evaluator.

## Verification

Check missing and active bounds, overlapping and enclosing intervals, reversed
tile edges, and exact high-precision edges. Verify replacement while a brush
is active, combined position and field predicates, conditional order, and
picking. Compare the live mm9 lens and gradient legend on all three backends.
