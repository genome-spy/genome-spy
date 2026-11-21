# Direct-color raster cells in Core

Accept decoded 8-bit RGB and RGBA pixels in the existing raster tile record. A
raster color field with `scale: null` reads one unsigned 32-bit `0xAABBGGRR`
word per cell in row-major order. Use straight alpha and set alpha to 255 for
RGB. Accept a `Uint32Array` or an array of unsigned 32-bit integers so both
named JavaScript data and inline JSON work.

```json
{
  "color": { "field": "pixels", "scale": null }
}
```

GenomeSpy's
[raster proposal](https://github.com/genome-spy/genome-spy/issues/755)
anticipated unscaled color. Like the
[deck.gl BitmapLayer](https://deck.gl/docs/api-reference/layers/bitmap-layer),
Core can consume decoded pixels. A renderer-specific image object would bypass
the existing tile dataflow and limit reuse across renderers. It would also
require a separate authoring form. Image loading, decoding, and new placement
options are outside this change.

## Implementation

- Let the raster mark resolve direct color from the normalized encoding and
  validate packed pixels at the existing tile boundary. Reuse packed buffers on
  the typed-array path. The existing local pass-through scale must keep these
  pixel values out of inferred domains and legends. Gradient brushing applies to
  quantitative color cells.
- Preserve panel placement, band strips, opacity, and the existing draw paths.
  WebGL2 can reuse the unsigned-integer tile texture and the unscaled color
  decoder. WebGPU can use the standalone renderer's existing `rgba8Unorm`
  mapping. Canvas2D can write the packed pixels to its retained tile bitmap. SVG
  export continues to use the raster view's backend.
- Verify the same Core spec in WebGL2, WebGPU, Canvas2D, and SVG export. Cover
  RGB channel order, per-pixel alpha combined with mark opacity, and typed and
  inline pixel inputs. Run the existing raster checks for scaled heatmaps,
  gradient brushing, and categorical strips.
- Document the input format with the raster mark and update the existing raster
  changeset.

Tentative commit: `feat(core): support direct-color raster images`.

## Verification

Chrome passed all 17 raster cases across WebGL2, WebGPU, and Canvas2D. The
direct-color case checks ordinary arrays and typed arrays side by side,
including inherited mark opacity and the pixels embedded in SVG. The SVG check
requests a pixel ratio of 1 so its readback coordinates match the raster export.
The existing heatmap, strip, and brush cases still pass.
