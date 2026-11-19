---
"@genome-spy/core": minor
---

<!-- category: feature -->

Add `bedColor()` to use BED item colors directly in mark encodings.

The BED loader exposes `itemRgb` on every row so that one track can use a
fallback color for files without a color column.
