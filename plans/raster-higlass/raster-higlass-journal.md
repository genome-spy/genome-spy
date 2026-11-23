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

## HiGlass and live navigation

- The public server serves Rao et al.'s GM12878 MboI all-replicate dataset on
  hg19. The browser requests its metadata and visible tiles directly. The
  metadata reports 256 × 256 cells per tile and levels 0 through 14. The grid
  step is `max_width / (2 ** level * bins_per_dimension)` base pairs. Both axes
  must use the tileset's chromosome names, lengths, and concatenation order.
  [Dataset metadata](https://higlass.io/api/v1/tileset_info/?d=CQMd6V_cRw6iCI_-Unl3PQ)
- Public tile responses confirmed that the default symmetric matrix stores tiles
  with x ≤ y and the lower half of diagonal tiles. The source transposes
  off-diagonal requests for display, mirrors the diagonal data in place before
  caching it, and decodes both HiGlass float payload sizes. NaN cells are
  transparent and a zero remains a valid contact value.
- Chrome on macOS loaded level 10 at the initial chr1 viewport, approximately
  49.15–57.34 Mb on both axes. Wheel zoom loaded level 11. A drag shifted the
  viewport and reverse wheel zoom widened it again. The color-domain maximum was
  0.054339 initially, 0.054331 after zooming, and 0.053823 after dragging. The
  viewport scale retains its existing 150 ms debounce. A tile-readiness promise
  can resolve before the legend settles. The live smoke test used the public
  endpoint and is kept outside the automated suite. The deterministic tests
  cover stale responses, the viewport intersection on both axes, and color
  domains for constant and missing-only grids.

- A literal four-stop range on the default linear scale used only the first two
  colors in Chrome. Vega's `yelloworangered` scheme worked with the viewport
  domain and gave low values a stronger yellow cast than the HiGlass palette.
  The `higlassFall` preset uses the four HiGlass colors through the same
  interpolating scale path as other named palettes.
  [HiGlass heatmap palette](https://docs.higlass.io/track_types.html#heatmap)

- The example uses a log color scale. Zero is excluded from the extent and
  remains in the tile buffer. With distinct positive bounds, clamping maps zero
  to the white end of the palette. A zero-only view retains the last valid
  extent. Chrome verified both bounds changing on zoom and sampled the zero-bin
  color from the WebGPU render. A provisional `[1, 1]` log domain prevents a
  legend warning during loading.
  [HiGlass logarithmic heatmap scaling](https://docs.higlass.io/track_types.html#heatmap)

## Measurements and decisions

- A 256 × 256 tile takes one dataflow record, six vertex invocations, and 256
  KiB of GPU cell-buffer storage. The initial viewport spans 2 × 2 tiles and
  takes 1 MiB of cell-buffer storage plus the per-tile attributes. The source
  cache retains at most 96 canonical float32 tiles, or 24 MiB at this tile size,
  excluding mirrors, packed upload buffers, and network payloads. These are
  storage calculations. Frame time and upload throughput remain unmeasured.
- The source coalesces x/y changes from the same turn, selects a level from the
  coarser bases-per-pixel of the two axes, and cancels superseded requests. It
  retains the previous publication while fetching the next complete window. This
  can leave newly exposed areas blank on a slow connection. A parent-tile
  fallback or incremental publication would trade simpler readiness for
  continuity. Profile decoding, transposition, visible-cell reduction, and
  uploads during rapid panning before placing them in a worker or on the GPU.
- Regular grid coordinates are independent of the values. That separation can
  support aligned `value` and `variance` fields or `base` and `quality` fields.
  A third spatial dimension also needs an explicit slice or projection and a
  documented axis order and stride. The PoC implicitly treats x as contiguous
  and accepts `dimension` through the shared position type. Tighten the
  raster-specific encoding contract and choose an explicit layout rule before
  stabilizing the grammar.
- Screen-sized icons could take scale anchors and pixel width and height.
  Stretching a tile to x/x2 and y/y2 could use the same texture coordinates.
  Direct RGBA and palette-indexed input need typed formats and per-cell encoder
  support. These placements and formats can share the dense storage contract
  without tying it to any particular mark name.
- The HiGlass adapter covers the power-of-two, square-bin format. HiGlass
  tilesets with explicit resolution lists need a different level selector.
  Core's generated schema recognizes the experimental grammar while WebGPU
  remains unpublished. Review how to expose the grammar when preparing a
  release. The reusable color scheme is release-noted as a Core feature.

## Cell opacity and the comparison lens

- The normal predicate resolver needs cell endpoints explicitly. The raster's
  x2/y2 encoders previously exposed expressions for tile endpoints, which the
  resolver treated as missing fields. Raster predicates now resolve against
  cell coordinates while placement continues to read tile endpoints.
- WebGPU derives positional inputs from tile bounds and fragment cell indices.
  Packed locus comparisons preserve the low part of fractional cell edges.
  Brush updates change selection uniforms without repacking the tiles.
- Canvas and WebGL reuse Core's predicate evaluator for opacity masks. For
  positional conditions, evaluating once per rectangular span reduced a
  synthetic 18-tile CPU mask run from roughly 75 ms to a 1.1 ms median on the
  development machine. This measures mask generation alone. Canvas still
  colorizes affected bitmaps and WebGL uploads the changed masks.
- The example uses the same tilesets and region as the original HiGlass
  comparison. Its shared viewport color domain settles after initial tile
  readiness. Compare the lens pixels after the scale has settled.
  [HiGlass comparison](https://link.springer.com/article/10.1186/s13059-018-1486-1#Fig4)

### Reconsidering conditional opacity

The lens now uses the ordinary brush outline. The inset shadow was removed
from the example and brush grammar.

One option was to use Core's existing cell-opacity evaluator
for all renderers. WebGPU could update a separate retained opacity buffer
while keeping tile values and geometry resident. This would remove Core's use
of derived positional predicate inputs and the associated packed-coordinate
shader path. The standalone renderer can still evaluate conditions on
explicitly supplied cell fields.

A dense float mask costs 256 KiB per 256 × 256 tile on each changed selection.
Positional brushes can use the constant-opacity spans the CPU evaluator
already finds. Clipping a layer to
the brush in screen coordinates would change how partially intersected cells
are selected.

The renderer-owned range table kept the public predicate clean, but its buffer
lifecycle made it larger. Changes in brush bounds, tile snapshots, and movable
icon anchors all invalidated the table. It added roughly 160 source lines in
the prototype. The implementation uses the explicit position projection with
the shared shader comparisons. Positional and field projections can coexist
even when the cell field is named `x` or `y`. Brush movement uses the existing
selection uniforms, and a moving icon automatically uses its current anchor.

### Sharing the CPU opacity path

Canvas and WebGL resolve uniform raster opacity once per draw. Conditional
opacity uses one traversal over groups of cells. Positional brushes find the
groups by bisecting the tile edges at each active threshold. Cells in each
group use the same opacity, so the mask can fill a row span and copy it to
adjacent rows. Color predicates visit every cell through the same traversal.

The two simplification passes removed 53 net runtime lines across Core and
the standalone renderer, measured from the snapshot before the API refactor
with the pending tooltip edits held constant. The CPU pass accounts for 38
of those lines.

The new positional reader matched the previous reader on 4,000 synthetic
interval cases. On 18 tiles of 256 × 256 cells, positional mask generation
took about 0.6 ms per brush update, down from 1.5–1.8 ms. Both gradient runs
took about 65 ms. These measurements cover CPU mask generation and exclude
browser drawing and texture uploads.

### Mask-free WebGL interval probe

The ordinary WebGL encoder generates its interval operands from vertex
attributes. The reusable GLSL generator already emits Boolean composition
and ordered branches. A raster can reuse that generator by supplying leaf
expressions that read a tile-local cell index or a value from the existing
cell texture.

For a positional interval, compute the matching index range on the CPU
using the tile's data-space edges. WebGL already has a draw per visible tile,
so the range can go into that draw's uniforms. A rectangular brush needs four
integer bounds per tile. The gradient predicate instead uses the raw float
cell value with directed rounding of the brush thresholds. Sampling opacity
before antialiasing keeps the existing color and picking paths usable.

A standalone Chrome probe used the existing raster shader and conditional
GLSL generator with these bindings. Pixel readback passed for a moved brush,
an empty brush, reversed orientation, combined position and color tests,
and picking. The range calculation matched the host predicate on 189,440
synthetic membership comparisons. The viewport range helper disagreed at
an exact fractional edge, so precise membership needs to compare directly
against the tile edges.

This probe did not integrate the resource bindings into the mark delegate.
Categorical cell predicates would also need the existing integer membership
texture and palette mapping. Canvas still needs its own evaluator for bitmaps
and software picking. A WebGL replacement should be measured after removing
the mask path, since retaining a second path would preserve most of the
current code and lifecycle.

### WebGL shader integration

WebGL now tests opacity at sample time with the existing cell texture,
per-draw index ranges for positional projections, float bounds for gradient
projections, and an integer membership texture for categorical colors. Tile
positions remain in data space, and the same cell shader serves screen
rendering, picking, and WebGL's hybrid SVG path. Canvas shares the exact
edge search for its CPU sampling groups.

The live comparison lens drew, moved, and cleared on all three renderers.
WebGL issued zero opacity texture uploads during that interaction. All
4,000 synthetic comparisons of the previous and current Canvas evaluators
matched. Focused browser regressions cover a partially initialized XY brush
and changes to a categorical color selection.

The integration adds 212 net runtime lines from the pre-implementation
snapshot, with the pending tooltip edits held constant. Most of the growth
is the GLSL predicate bindings. The change removes per-cell CPU mask
generation and alpha-texture uploads on WebGL, while Canvas still uses the
CPU evaluator.

### Canvas drawing and picking

`RasterMark` now owns opacity validation and the branch metadata shared by
Canvas and WebGL. The Canvas evaluator sends spans directly to the tile
painter, which drops the intermediate float buffer. Picking reads the
painted alpha bytes and uses the same scale snapshot and branch state as
drawing. This also removes the separate color lookup and visibility cache
from the picking pass. An interactive 256 × 256 tile keeps 64 KiB of alpha.
Previously, each tile with conditional opacity kept a 256 KiB mask and
picking used a temporary visibility array.

Reading the painted bitmap back during each pick would also share alpha,
but would add synchronous canvas readback or require retaining the full
RGBA buffer. The byte cache also supports picking before the first paint.
On that path, the tile's image data stays in the cache until drawing.

The change adds five net runtime lines relative to the WebGL shader
implementation. The Canvas evaluator is loaded only with Canvas in the
code-split build. The initial ESM load saves 656 gzip bytes and the cumulative
WebGL load saves 749. The UMD size is effectively unchanged.

The bundle check also caught an eager import of the shared raster geometry
from tooltip picking. The active backend now resolves the picked cell using
its own sample coordinates. The minimal bundle check passes.

Replaying 300 brush updates on the public HiGlass lens per variant, with
eight 256 × 256 tiles and a 740 × 540 Canvas viewport, reduced median render
time from 42.8 to 41.2 ms and p95 from 47.7 to 45.1 ms. Both builds had a
50.1 ms p95 frame interval. The Canvas lens still rebuilds colored pixels
on a brush update. Keeping a second, unconditioned RGBA tile cache could
avoid repeating that work at the cost of another four bytes per cell and
more cache state.

## Loading the HiGlass module

The standard Core entry registers a dynamic importer for `higlass`. View
construction resolves the importer for a matching declaration before the
synchronous dataflow creates its source. The visible-data wait reads the
source's remote-lazy flag, which removes the engine's dependency on the concrete
loader.

The bundle check requires HiGlass to be outside the ESM entry's static
dependency graph and absent from the minimal build. Chromium requested the
separate module only for the HiGlass spec. The single-file UMD build includes
the module bytes and also loaded the fixture tiles on demand.

## Triangle color domains

The triangle example infers its logarithmic color domain from published tiles.
Navigation within a tile set keeps its colors stable. Strong contacts in clipped
cells can still affect contrast. Exact viewport scaling would still need a
layout invalidation subscription if Raster owned it. Inferring the domain from
loaded tiles removes the subscription and the per-row color-domain clipping.
The HiGlass tile planner still uses track height to select tiles.

## Picking and predicate boundaries

Keep the existing picking IDs and renderer-specific pixel sampling. At layout
completion, retain only the placements of rasters that participate in picking.
Repeated and faceted placements still need their original rendering options.
The filter scans the completed layout once. Render-only frames skip it.
The raster program supplies its cell-edge and packed-bound WGSL expressions.
The shared shader builder still applies the same interval comparisons.
HiGlass applies its cache budget after decoding, including partial failures.
Verify raster tooltips, ordinary and raster interval predicates, and a retry
after an incomplete tile response.
