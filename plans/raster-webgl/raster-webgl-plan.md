# WebGL2 raster rendering

Support the raster grammar from
[issue #755](https://github.com/genome-spy/genome-spy/issues/755) in Core's
default GPU renderer. The first implementation covers the HiGlass contact map
and categorical MSA strips, including interactive color domains, gradient
brushing, and close locus zoom. The existing grammar and source limits define
the scope. Cell picking, additional encodings, batching, cross-tile filtering,
and mipmaps are outside this work.

## Ownership and design

- `RasterMark` owns dimension bindings, tile validation, cell color domains, and
  interpretation of gradient selections. `HiGlassSource` continues publishing
  one datum per tile. Both GPU backends consume the same collector and scale
  resolutions. Tile-level opacity still uses Core's row encoder. A gradient
  opacity predicate tests the raw value of each sampled cell.
- Add a WebGL delegate through `WebGLRendererResources`. Reuse the buffered draw
  order, collector revisions, facet batches, view opacity, and clip rules. The
  delegate owns the tile textures and program. Retain textures for the current
  collector publication and rebuild them on a data revision. This honors
  republished records even if their identity is unchanged. Release textures when
  a publication is replaced and on disposal. Use the existing WebGL color range
  and stable category-slot textures. Preserve missing and unknown values as
  transparent. For log scales, clamp in data units when requested and reject
  values outside the log domain's sign before applying the transform. Use the
  ramp midpoint for a collapsed continuous domain.
- Start with one cached texture and one quad per tile. Use `R32F` for numeric
  values and `R32UI` for categorical IDs. Read cells with `texelFetch`. Apply
  the existing GLSL color scale to the sampled values in the fragment shader,
  including the current palette or ramp. Scale and brush changes update uniforms
  and shared lookup textures without reuploading the cells.
- Reuse the existing CPU edge projection in `rendering/immediate` to honor band,
  index and locus semantics in double precision. Clip the quad to visible bounds
  and send coordinates relative to a nearby cell boundary. Reuse the immediate
  occurrence helper for collector facet lookup and sample-facet placement.
  Resolve occurrences at draw time so a callback created for an empty facet can
  draw when data arrives. Use the same pixel-offset convention as neighboring
  WebGL marks in live and export passes.
- Match the existing WebGPU filter. Split the device-pixel footprint at the
  nearest boundary on each axis, evaluate up to four samples, and blend their
  premultiplied colors. Keep a one-sample path away from boundaries. The
  footprint stays within each tile.

[deck.gl's BitmapLayer](https://deck.gl/docs/api-reference/layers/bitmap-layer)
demonstrates the bounded texture geometry.
[HiGlass's heatmap track](https://github.com/higlass/higlass/blob/develop/app/scripts/HeatmapTiledPixiTrack.js)
uses a tile-to-pixel conversion and a color lookup table. Keeping the raw cell
values in WebGL textures avoids regenerating those pixels as the brush or domain
changes. [WebGL2](https://registry.khronos.org/webgl/specs/latest/2.0/) supports
the texture formats and integer texel access. No external implementation code is
copied. A texture array could reduce draw calls for many same-sized strips. Its
allocation and update machinery can wait until profiling shows that the simple
path needs it.

## Milestones

1. **Render tiles on WebGL2.** Register and wire the retained delegate, draw
   numeric and categorical tiles, and reuse the live Core scale state. Handle
   clipped, reversed, and close-zoom axes, facets, and image export. Run the
   existing composed-grid, MSA, and one-base alignment browser cases with
   explicit WebGL selection. Add the WebGL coverage to the existing raster
   changeset. Commit as `feat(core): render raster marks with WebGL2`.
2. **Match interaction and filtering.** Apply per-cell gradient opacity and
   color-space antialiasing. Extend the existing brush test to WebGL and
   exercise a fractional cell edge with transparent and categorical samples. Run
   Core raster browser cases across all three current live backends. Smoke-test
   the existing HiGlass and MSA specs via the default renderer, including
   HiGlass pan, zoom, and brush. Review the integrated change for unnecessary
   code, GPU state leaks, stale tiles, and export regressions. Commit as
   `feat(core): brush and antialias WebGL raster cells`.

## Acceptance and open questions

The same specs render through explicit WebGL and the default renderer. HiGlass
tile replacement and viewport-driven log mapping stay live. The gradient brush
makes out-of-range cells transparent. MSA letters retain the palette through
index zoom, and a neighboring rule remains aligned at close locus zoom. Data
changes release retired textures, mapping and brush changes preserve them, and
empty facet data can become populated without rebuilding layout. Check existing
PNG and hybrid SVG rasterization with WebGL selected. The first version should
record any observed draw-call or texture-size limits in the raster journal.
