---
"@genome-spy/core": minor
"@genome-spy/app": minor
---

Add `surround` composition for annotated heatmaps, UpSet matrices, and other
plots with aligned marginal tracks. A central `spec` controls the plotting
extent, and optional top, right, bottom, and left groups share its coordinates
while retaining local scales and shared side data scopes.
Side decorations automatically reuse available empty corners while honoring
explicit overhang settings.
Shared side-local axes use each track's plotting span, including when tracks
have different widths or heights.

Side tracks can themselves use `surround`: their central plots stay aligned
while their own annotations occupy free corners. Nested annotations extending
along the outer aligned dimension require fixed or step-based thicknesses.
Overlapping occupied panels report an error naming the conflicting views.

Unit and layered plots, including imports, retain ordinary axes, titles,
legends, hover interactions, and visibility. Nested centers, authored concats,
facets, scrolling, and cross-region axes remain unsupported.
