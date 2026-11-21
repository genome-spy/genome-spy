# Raster cell encoders and Canvas rendering

## Contract and ownership

Keep raster spec syntax and tile records as authored in the HiGlass and MSA
examples. The existing position encoders define tile edges and band placement.
Core resolves each raster color field as a dense cell input and binds it to the
existing color-scale resolution. Reading cells and contributing their domain
must work before scale mapping is available. Data readiness and domain updates
remain owned by the flow and scale resolution.

Reuse the cell-field binding for WebGPU and the Canvas backend. Use a distinct
domain contribution identity for cell scans and scalar row accessors, including
the bound dimensions when they change how a field is interpreted. Preserve
viewport windows, nonfinite-value handling, logarithmic zero handling, and the
explicit ordinal domain used by MSA.

## Milestone 1: Canvas

Reuse the immediate-mode positional projector to produce oriented tile edges and
cull against existing placement clips. Canvas colorizes visible tiles to
straight RGBA bitmaps and draws them with smoothing disabled. Cache by tile
publication and the resolved color mapping. Placement changes and constant mark
opacity can reuse an existing bitmap. Keep Canvas resources within the backend.
Retain authored tile order and existing picking behavior.

Vega's heatmap transform is precedent for colorizing a grid into a bitmap for
software rendering. GenomeSpy can keep the raw cells for GPU rendering and
derive the bitmap in its Canvas backend.
[Vega heatmap transform](https://vega.github.io/vega/docs/transforms/heatmap/)

Verify reversed index or locus axes, exact band edges, gaps and unknown bases on
strips, clipped tiles, viewport log domains, and repaint after palette or domain
changes. Run the MSA and HiGlass examples in Canvas and keep the WebGPU browser
regressions passing. Have a subagent review the implementation.

Tentative implementation commit: `feat(core): render raster marks in Canvas2D`.

## Milestone 2: Brush raster values from a gradient legend

Use the existing legend-bound interval parameter and a single value condition on
`opacity`. Resolve its quantitative `color` projection to the raster cell
binding. The condition compares the raw cell value against the half-open
interval. An empty brush follows the usual `empty` behavior. HiGlass uses
opacity one inside the brush and zero outside it. Existing tile opacity
predicates still evaluate against the tile record. Conditions combining cell and
tile predicates and positional selection of cells are outside this milestone.

Reuse the parameter runtime and resolve the condition once in Core. Both
renderers consume the same half-open bounds and opacity values. WebGPU applies
them with one retained mark property in the fragment stage. Canvas includes them
in its bitmap cache key. Keep the brush out of domain collection so values
hidden by the brush still contribute to the viewport color domain. Allow the
gradient legend to wait for an invertible mapping while lazy log scales have a
provisional or flat domain.

Vega-Lite's conditional value encoding is precedent for the condition and
fallback. GenomeSpy's existing gradient legend supplies the predicate bounds. A
dedicated raster filter or a dataflow transform would add a parallel selection
API or republish the tiles on every drag.
[Vega-Lite condition](https://vega.github.io/vega-lite/docs/condition.html)

Verify pointer brushing, transparency, clearing, half-open bounds, and unchanged
color domains in Canvas and WebGPU. Use HiGlass to check lazy startup, value
brushing, and navigation while a brush is active. Exercise a collapsed domain,
an empty-width selection, and an unbounded upper limit. Disable brush inversion
while the domain is flat and preserve clearing.

Tentative implementation commit:
`feat(core): brush raster values from gradient legends`.

## Milestone 3: Standalone WebGPU raster API

Create a raster mark with structured `data.tiles` and `data.cells`, positional
scale descriptors in `position`, and cell encodings in `channels`. Tile arrays
supply oriented endpoints, dimensions and offsets into equal-length, named cell
arrays. Cells divide the rectangle uniformly after projecting its endpoints. The
same snapshot covers strips and matrices. Tilers and resolutions remain the
application's responsibility.

Use the renderer's existing scale, selection and order APIs. Compile position at
tile scope and evaluate fill, opacity, predicates and order at cell scope.
Predicates read raw cell fields, including fields with no visual channel.
Support numeric half-open intervals and categorical membership. Order uses the
renderer's two passes and each cell belongs to exactly one pass. Keep placement
clipping at tile scope. Support packed RGBA as a fill source.

`series.replace(snapshot)` replaces both scopes together. Validate types,
lengths, dimensions and referenced ranges and prepare both uploads before
publishing a replacement. Allow empty snapshots and shared ranges. The field
names and numeric types establish the retained shader layout. Tile columns that
shared an initial array can diverge on replacement.

The Core adapter translates the existing grammar to this API. It binds the
gradient legend to a renderer selection and broadcasts an MSA strip category as
a raw cell field when required by its opacity condition. Reuse the structured
snapshot during scale and selection changes. Verify standalone rendering,
overlapping tiles with conditional order, and incompatible replacement, then
exercise the existing Core HiGlass and MSA paths.

The design review identified fragment-stage scale and selection bindings,
precision at Float32 interval boundaries, column aliasing across replacement,
and the need to distinguish renderer access to cell and tile indices. The
implementation should check these contracts directly.

## Close-zoom raster precision

Bound the drawn rectangle by the render target and address cells relative to a
nearby cell boundary. For matching index mappings, project that boundary from
the packed genomic edges so it keeps its precision after zoom. Reuse the
existing scale and position slots, placement, draw order, and cell storage. Core
uses packed locus edges independently of the active domain and applies the same
signed edge placement as the locus scale.

Crop Canvas source and destination rectangles together before drawing the cached
bitmap. Verify a fractional pan across an internal boundary and a shared edge at
one-base zoom, reversed axes, and a packed endpoint above 2^32.

## Follow-up milestones

- SVG export should recognize raster marks in the counting and emission passes
  and embed their images in paint order alongside vector axes and labels. It
  must handle the default async export and an unavailable rasterizer explicitly.
  The instance threshold remains useful for vectorizable marks.

An independent design review confirmed that the current grammar can support
these milestones. The main integration risks were bootstrap domain scanning,
oriented placement and revision-based Canvas caching, and the default SVG export
path.
