# Triangle projection for raster tracks

## Proof of concept

A Chrome Canvas2D prototype drew synthetic matrix tiles with an affine
transform. Pixel probes verified the diagonal at the locus baseline, clipping
below it, and two adjacent contact cells across a tile seam. The rendering uses
the midpoint of the endpoints on x and half their projected separation above the
baseline. This matches the track layout of
[HiGlass](https://docs.higlass.io/track_types.html#rotated-2d-heatmap) and the
natural-height form in
[JBrowse](https://jbrowse.org/jb2/docs/user_guides/hic_track/#fitting-the-triangle-to-the-track-height).
No code is copied from either project.

## Contract

```json
{
  "height": 150,
  "mark": { "type": "raster", "projection": "triangle" },
  "encoding": {
    "x": { "dimension": "column", "type": "locus", "scale": { "zoom": true } },
    "color": { "field": "value", "type": "quantitative" }
  }
}
```

Use the raster tile contract, with `x.dimension` selecting columns and `row`
supplying the other matrix dimension. The triangle has one unpadded locus scale.
Project both dimensions through that scale, keep the baseline at the bottom of
the view, and clip to the view. Reversing x reverses horizontal order and
preserves the triangle above the baseline. Track height limits visible
separation. Coordinates are in the assembly's concatenated space as in the
rectangular matrix, with a single-chromosome initial viewport for the example.
Both tile axes use nonnegative whole-base endpoints, validated in Core's shared
tile reader before renderer-specific encoding. Chromosome masking, alternative
height fitting, picking, and additional filtering are outside this change.

## Milestones

1. **Draw an in-memory triangle.** RasterMark normalizes only the authored x
   extent. Row bounds come from tile metadata. In Core, share triangle geometry
   between immediate placement, WebGL, Canvas2D and SVG run bounds. Canvas draws
   the retained bitmap through the affine transform. GPU paths project the tile
   quad and recover tile-local source cells before applying existing color and
   opacity. Clip drawing and SVG run bounds to the track regardless of the
   mark's ordinary clip default. Preserve local anchors for locus precision.
   Standalone raster geometry can opt into the same projection with both
   endpoint channels in common x-pixel coordinates. Keep the existing
   axis-aligned paths for regular rasters and icons. Verify the baseline,
   reversed x, a diagonal cell straddling the baseline, and a seam close to
   base-pair zoom.
2. **Wire viewport loading and the example.** `data.lazy.projection: "triangle"`
   selects the HiGlass request window. The source uses the declaring view's x
   extent, width and height. The mark configures drawing independently, so the
   source can also be configured on a layer with a shared x scale. Omitting the
   source option keeps the rectangular request window. With viewport `[L,R]` and
   height covering `D` bases, the source spans are `[L-D,R]` and `[L,R+D]`.
   Filter whole tiles by projected midpoint and separation. Key readiness on the
   surviving tile set, select resolution from x before padding, and reuse the
   existing cache, tile symmetry and requests. Derive the viewport color domain
   from a visible column range per row and invalidate it on layout changes as
   well as x-domain changes. Copy the current HiGlass example, retain its
   dataset, gradient brush and scheme, and use one horizontal genomic axis.
   Verify load, pan and zoom including an endpoint outside the visible x domain.
   Update the raster changeset and spec JSDoc.

The original example, strips and icon placement serve as regression cases. Run
the Core raster browser and relevant HiGlass tests, generate the schema, and
smoke-check the new example through the standard Core entry point. Review both
the plan and the implementation.

Tentative commit: `feat(core): render Hi-C matrices as triangle tracks`.
