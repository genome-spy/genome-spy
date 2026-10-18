---
"@genome-spy/core": minor
---

<!-- category: feature -->

Adds fixed-size grouping gaps to index and locus scales with `gapPositions` and
`gapWidth`, including chromosome gaps and matching axis domain lines. Adds the
`scaleGroups` data source for group guides and outlines, plus mark-local `clamp`
for either or both axes.

Improves fragment shader stability by always clamping long rules. This fixes
visual artifacts in the synteny example when zooming in very close.
