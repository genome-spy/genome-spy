# Raster and HiGlass PoC journal

## Initial alternatives

| Area        | Alternatives and rationale                                                                                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dataflow    | Carry one record per tile to reuse flow completion and view ownership. A dedicated tile collector could make array transforms more explicit if broader consumers need them. Flattening cells into rows would retain row-transform behavior at the cost the PoC is meant to measure.              |
| Sources     | A HiGlass reader gets prepared tiles through a public API. A client-side `.hic` reader would work with a static range-readable file and require densifying decoded contact blocks. Zarr would fit multiple aligned arrays well and would need a convention for genomic metadata and resolutions. |
| Tiling      | A single eager grid is a useful deterministic fixture. Viewport-driven tiles let the dataset zoom from genome-wide to local detail. Compare an atomic viewport replacement and a bounded tile cache with incremental publication or parent-tile fallback if switching levels looks disruptive.   |
| Encoders    | Reuse position, scale, and guide resolution around a dedicated read of dense cell values. A generic array-aware encoder could serve more marks later. A separate colormap owned by the data source would duplicate color-scale state and bypass shared legends.                                  |
| GPU storage | A packed read-only buffer can represent typed fields of different kinds. Texture arrays suit uniform tile sizes and would make sampling and filtering natural. Keep the storage choice private to the renderer.                                                                                  |
| Placement   | Start with genomic grid dimensions. Preserve the ideas of scale anchors plus CSS-pixel width/height for icons and explicit x/x2 and y/y2 bounds for stretching in data space. Those uses exercise the distinction between tile geometry and its values.                                          |

## Matters to revisit

- Color range stability when a viewport includes outliers, near-zero values, or
  mostly missing bins. Compare display quality between an exact extent and a
  robust range, and keep the legend's scale authoritative.
- Retained upload cost when successive viewports share most of their tiles.
  Inspect actual resource updates before choosing per-tile caching or an atlas.
- Additional field support including variance as opacity and indexed RGB
  palettes. Check whether the renderer can reuse the same scaling hooks without
  introducing extra reads for a typical one-field tile.
- Tile-mask and picking behavior at seams and when a new resolution arrives.

## Plan review

The independent review identified three correctness boundaries. Keep color
autoscaling under the existing viewport domain owner, including when tile
membership stays the same. Seed navigation from stable domains and publish
coverage for both axes and the active resolution. Match HiGlass's asymmetric
tile IDs and preserve displayed x/y coordinates when transposing a tile. Test
missing and constant color extents and late arrivals.
[HiGlass tile mirroring](https://github.com/higlass/higlass/blob/develop/app/scripts/HeatmapTiledPixiTrack.js#L1567-L1607)

## Renderer and static tiles

- The raster lowers its positional dimensions to tile endpoint encoders. This
  reuses the integer locus scale, layout, and clip code. The same fixture passes
  in Chrome with a reversed vertical scale, a live color-domain change, and an
  ordinary rule at a bin boundary above 2 billion bp. The rule needs `band: 0`
  to anchor to that boundary.
- The WebGPU mark holds a separate scalar storage buffer. Existing scale code
  reads it by fragment cell index. The adapter packs one array per collector
  publication and keeps that array for scale changes. A new publication still
  packs and uploads the entire retained set. Per-tile updates and buffer
  suballocation are candidates if real navigation shows upload cost.
- Core's scale planner identifies the raster color contribution explicitly. It
  reduces cells over the existing viewport bounds and keeps the scale and legend
  under the existing domain owner. A second grid consumer would help determine
  whether to introduce a generic domain-contribution hook.
- The initial input contract uses row-major values with the x-bound dimension
  contiguous. RGB, categorical fields, per-cell opacity, explicit image bounds,
  and fixed-size icons remain test cases for the grammar design.
