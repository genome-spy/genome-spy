---
"@genome-spy/core": minor
---

<!-- category: feature -->

Load Juicer .hic contact maps directly from a file URL.

Display rectangular or triangular maps with the raster mark. As you zoom, the
source selects a stored bin size and loads the visible region using byte-range
requests. A bound parameter can switch between the file's stored normalizations.
Tiles from both the Juicer and HiGlass sources expose their resolution in base
pairs as `binSize`.
