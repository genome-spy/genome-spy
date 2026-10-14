---
"@genome-spy/core": minor
---

Encode independent secondary endpoint displacements with `x2Offset` and
`y2Offset`, sharing the corresponding primary offset scale. The reactive
`step()` expression helper converts relative row positions into padded row-step
offsets while preserving discrete index scales, including grouping gaps.
Canvas and SVG now honor within-band placement on nested offset scales.

The `dendrogram` transform lays out precomputed node tables with explicit leaf
row indices and merge heights, producing parent–child edges with separate
integer anchors and relative offsets for heatmap-aligned links.
