# WebGPU raster mark and HiGlass proof of concept

[Issue #755](https://github.com/genome-spy/genome-spy/issues/755) proposes
rendering dense arrays without creating a dataflow row or geometric instance for
every cell. The PoC will display a public GM12878 Hi-C matrix and establish
which parts of GenomeSpy's encoding pipeline can serve dense data.

## Scope

- Render a regular 2D grid as one quad per tile using WebGPU. Bind grid
  dimensions to ordinary positional scales and read a named quantitative field
  in the fragment shader. Keep the tile value format open to multiple fields and
  ranks.
- Fetch visible HiGlass tiles at the resolution appropriate to the current x/y
  domains and plot size. Support existing pan and zoom gestures on both axes.
  Adapt the color domain to the visible finite values at the active resolution.
- Use the public hg19 Rao et al. GM12878 MboI all-replicate tileset
  `CQMd6V_cRw6iCI_-Unl3PQ`. The verified `9.6.6` tile is a 256 by 256 grid at 32
  kb.
- Leave WebGL, Canvas2D, SVG, point selection, richer positional scales, and
  additional file formats outside the PoC. Evaluate fixed-size and explicit
  interval placements, RGB and palette inputs, and additional encodings in the
  [journal](raster-higlass-journal.md).

## Architecture

Core owns tile shape, values, and positions. Keep one record per tile in the
existing flow and collector. Grid dimensions describe the first edge, step, and
count in data coordinates. Resolve them through the same x/y scales as ordinary
marks so another layer can share the axes. Validate dimensions and array lengths
at ingestion and keep arrays immutable after publication. The PoC can use its
native tile endpoints to drive the existing position encoders. Extend the
existing `scale.domain: { source: "viewport" }` contribution to reduce the
intersecting cells in both dimensions, including navigation within the same set
of loaded tiles. The existing scale owner controls the domain and legend. The
fragment shader reads the original sample.

The WebGPU adapter translates tiles and scales to a generic renderer mark.
Separate tile instance count from cell storage. Reuse the scale compiler for
fragment-stage color mapping, bind the needed scale resources there, and keep
tile uploads independent of live scale updates. Build on retained resources and
the frame's existing view placement and clipping. Keep GPU objects within the
backend and dispose them through the mark/view lifecycle.

The HiGlass source owns metadata, fetching, tile selection, and cache lifetime.
Start with the dataset's power-of-two tile pyramid. Validate the assembly and
chromosome order before treating tile offsets as genome-wide coordinates. Seed
axes from the assembly or authored domains. Select a level using the coarser
bases-per-pixel requirement of the two axes to bound tile count for asymmetric
viewports. Clip requests to the dataset extent. Publish the latest tiles and
coverage together. Coverage includes both axes and the level. Cancel superseded
requests. For a symmetric tileset, request the stored half, transpose mirrored
tiles, and keep the displayed tile origins. Check diagonal handling against
actual data. Skip missing samples when reducing color extents and preserve zero
values.

## Milestones

1. Implement the renderer mark and integrate prepared tiles through the Core
   adapter. Verify rendering and live scale changes with an asymmetric grid,
   reversed y, and a row-backed locus rule at a cell boundary. Spell out initial
   encoding support in types and record integration tradeoffs in the journal.
   Tentative commit `feat(webgpu): render dense raster tiles`.
2. Add the HiGlass source and runnable example. Verify tile coordinates,
   decoding, stale request handling, and viewport color domains for both a
   constant and a missing-value grid. Exercise panning and zooming through
   distinct levels in the WebGPU browser, confirming the shared scale and legend
   stay aligned. Record source and assembly in the example. Tentative commit
   `feat(core): load HiGlass raster tiles by viewport`.

After each milestone, check the account allowance and update the journal with
evidence and outstanding decisions. Keep a margin for verification and commit
work near the user's 50% target.

## References

- [HiGlass dataset metadata](https://higlass.io/api/v1/tileset_info/?d=CQMd6V_cRw6iCI_-Unl3PQ)
- [HiGlass tile API](https://docs.higlass.io/higlass_server.html)
- [Viv paper on retaining raw values for GPU color mapping](https://pmc.ncbi.nlm.nih.gov/articles/PMC9637380/)
