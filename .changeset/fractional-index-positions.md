---
"@genome-spy/core": minor
---

Add opt-in `scale.fractional: true` for index scales so dendrogram branches can
meet connector midpoints while retaining row alignment, padding, and zoom.
Fractional positions are supported by WebGL, Canvas/SVG, and experimental WebGPU.
Default index and locus positioning is unchanged. GPU interval-selection
predicates explicitly reject fractional index channels.
