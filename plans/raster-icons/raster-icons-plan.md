# Anchor raster icons in screen space

Implement the icon use case from
[issue #755](https://github.com/genome-spy/genome-spy/issues/755). The Core
`icon` mark projects ordinary x and y encodings to an anchor and centers a tile
there. Its positive resolved `size` is area per source cell in CSS pixels. At
size 1 the width and height are the tile's column and row counts. Each side
scales by the square root of size. The optional `columnDimension` and
`rowDimension` select names in the tile record, defaulting to `column` and
`row`. Use row-major order with the first row at the top. Positional reversal
and zoom move the anchor. They do not change the screen orientation or size of
the image. This follows the position and screen-size split of
[deck.gl IconLayer](https://deck.gl/docs/api-reference/layers/icon-layer) and
Core's existing square-root sizing for point marks.

## Implementation

1. Register `icon` and `raster` with the same Core mark implementation. Each
   mark declares its own properties and supported channels. Icon shape comes
   from counts and does not use grid origin or step. Size is evaluated per tile
   using a numeric field, value, or expression and the ordinary scale machinery.
   Color and opacity retain their existing semantics. A viewport color domain
   includes the entire tile when its anchor is in the viewport. Axis endpoints,
   conditional placement and size, other alignments, picking, and filtering
   changes are outside this mode.
2. Use the same standalone `rasterMark` for both Core marks. A tile can supply
   an anchor in place of a trailing edge on each axis. Its placement descriptors
   can supply a constant or scaled tile size, and the retained snapshot owns
   per-tile geometry arrays. Expand the anchor in CSS pixels after the existing
   scale and panel placement in the WebGPU vertex shader. Keep cell inputs,
   conditions and order separate from tile geometry. Canvas2D and WebGL2 share
   Core's immediate placement visitor. SVG uses the existing hybrid path.
3. Add a standalone Storybook scene that draws several differently sized bowties
   from the same 64 × 64 RGBA payload. Verify Core with variable dimensions, a
   data-driven size, anchor movement on zoom, and SVG export. Re-run the raster
   regression cases, type checks, and Storybook build. Record the grammar next
   to IconProps and extend the existing raster changeset.

Tentative commit: `feat(core): support anchored raster icons`.

## Verification and follow-up

Chrome passed all 20 Core raster tests and the standalone raster regression
tests. The icon test combines two aspect ratios, a size scale, zooming, and
hybrid SVG export. The embedded SVG image is cropped, so the test samples
relative to the image's SVG coordinates. The built Storybook rendered all three
bowties at their intended sizes. The inline
[Core example](../../examples/core/raster/icons.json) passed schema validation
and the WebGL smoke check.

The simplification pass removed 56 runtime lines by sharing dimension and
viewport validation and consolidating WebGPU tile setup. The raster browser and
standalone GPU checks passed after the changes.

The Core grammar distinguishes the marks because their positions and supported
channels differ. Both use the same tile format, shader, and cell encodings.
