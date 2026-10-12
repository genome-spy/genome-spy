---
"@genome-spy/core": minor
---

Add a mark-local `clamp` option to constrain anchors or range endpoints to the
view on both axes or only `"x"` or `"y"`, without changing shared scales. This
keeps group outlines and guides around visible data while zooming; combining it
with `clip: false` preserves full strokes at the edges. Collapsed rectangles,
explicit text ranges, and coincident line endpoints are hidden before geometry
expansion. Clamping is disabled by default.
