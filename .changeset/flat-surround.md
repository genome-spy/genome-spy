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

The first version supports unit and layered plots, including imports, with
ordinary axes, titles, legends, hover interactions, and visibility. Nested
concat, facet, and surround plots are deferred.
