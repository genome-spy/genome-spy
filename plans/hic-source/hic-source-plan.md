# Direct .hic contact maps

## Goal

Add a lazy `hic` data source for HTTP-hosted Juicer contact matrices. The same
raster specification can draw a rectangular map or a triangle track. Pan and
zoom select among the file's stored base-pair resolutions.

## Design

- The lazy source owns file, cache, and viewport lifetimes. Register it like
  HiGlass, so the ESM build loads the reader only when a spec declares `hic`.
  The minimal entry point can opt in by importing the registration module.
- Use [GMOD's reader](https://github.com/GMOD/hic) and its
  [range cache filehandle](https://github.com/GMOD/range-cache-filehandle).
  JBrowse also uses the reader for chromosome-pair queries. GenomeSpy will
  translate contact arrays to its own raster tile datums.
- Choose a stored resolution from bases per pixel. Plan bounded 128-bin tiles
  within chromosome pairs. For a triangle, use the visible midpoint and distance
  ranges, including endpoints that fall outside the displayed axis. Match file
  contigs to the locus assembly by name and length, and give short final bins
  their true extent.
- Publish complete viewport snapshots through the existing DataSource and
  collector. Cache decoded raster tiles within a byte budget, debounce cache
  misses, and abort superseded reads. Report coverage through the existing
  lazy-readiness methods. Keep HiGlass's tile protocol and scheduling local to
  its source. Its global power-of-two grid is specific to its server.
- Raw counts are the default. A requested stored normalization must be available
  for the queried pair and resolution. Preserve masked bins as missing values
  and missing sparse contacts in valid bins as zeros.

Eagerly loading a chromosome or file would increase latency and memory at high
resolution. Requiring a tile server would prevent opening files that are already
hosted on a byte-range server. Both loaders can be deleted independently because
raster tiles and projections carry no format-specific state. Local file pickers,
observed/expected matrices, and Cooler are outside this change.

## Milestones

1. Implement the file-backed source and its tile planner. Headless specs with a
   controlled reader verify collector publication, trans axes, terminal bins,
   normalized missing values, empty coverage, cached revisits, and stale
   requests. The planner also verifies the triangle footprint and coarser
   fallback when a window exceeds the tile budget.
2. Document the source and verify the live example. Core and App schemas accept
   the example. Earlier browser checks loaded contacts in both layouts and
   changed the triangle bins from 10 kb to 5 kb on zoom. The documentation
   example now uses the versioned, cis-only GM12878 DpnII file built by the
   dataset recipe. Chromium loaded it through CloudFront byte ranges and
   switched among raw counts, VC, VC_SQRT, and KR. The ESM bundle check verified
   that both matrix readers are lazy. The existing HiGlass and raster
   regressions passed.

## Acceptance

A spec can use a .hic URL in a normal raster layer with the existing glyphs,
scale configuration, and view projection. Chrome renders a known populated
region and changes the bin size on zoom. Source errors and unsupported viewport
sizes resolve through lazy data status. The Core and App schemas accept the
documented configuration.
