---
"@genome-spy/core": minor
---

Add `facet` composition for displaying data groups as wrapped columns or a
row/column matrix, with shared scales, axes, and legends, group labels, and scrollable
viewports. Facet culling respects clipping in either or both directions.
Cell titles, backgrounds, and guide layering follow the same layout rules as
concatenated views. Independent per-facet scales and axes are not supported.
Explicit independent positional resolutions on the facet or its children are
rejected with a clear error.
Wrapping column counts must be positive integers.
Grouped and sorted data retain physical row shapes when materialized or replayed.
Stacks restart within each facet instead of accumulating across groups.
Sampling applies its requested size independently to each facet.
