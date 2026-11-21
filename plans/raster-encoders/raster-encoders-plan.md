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

Reuse the parameter runtime and selection shader generation. WebGPU evaluates
cell opacity in the fragment stage using the existing raster buffer. A brush
update changes selection uniforms. Canvas includes the effective selection and
opacity values in its bitmap cache key. Keep the brush out of domain collection
so values hidden by the brush still contribute to the viewport color domain.
Allow the gradient legend to wait for an invertible mapping while lazy log
scales have a provisional or flat domain.

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

## Follow-up milestones

- SVG export should recognize raster marks in the counting and emission passes
  and embed their images in paint order alongside vector axes and labels. It
  must handle the default async export and an unavailable rasterizer explicitly.
  The instance threshold remains useful for vectorizable marks.
- WebGPU can compile typed value-to-color functions and declare the required
  fragment bindings before code generation. Start with cell color because
  position scales and row conditions may depend on instance context.

An independent design review confirmed that the current grammar can support
these milestones. The main integration risks were bootstrap domain scanning,
oriented placement and revision-based Canvas caching, and the default SVG export
path.
