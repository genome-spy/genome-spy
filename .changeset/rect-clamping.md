---
"@genome-spy/core": minor
---

Add a rect-mark `clamp` option to constrain projected bounds to the view on both
axes or only `"x"` or `"y"`. This keeps group outlines around visible data while
zooming; combining it with `clip: false` preserves the full stroke at the edges.
Rectangles that collapse along a clamped axis are hidden, and shared scales and
other marks keep their existing behavior.
