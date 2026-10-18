---
"@genome-spy/core": minor
---

<!-- category: feature -->

Fit viewport-derived scale domains to complete links or intervals with
`domain: { "source": "viewport", "mode": "contain" }`. The clustered heatmap
example uses this option with scale padding to expand local dendrogram branches
while keeping them clear of panel edges when zooming and panning the matrix.
The default intersection behavior is unchanged.
