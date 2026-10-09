---
"@genome-spy/core": minor
---

Add opt-in `scale.fractional: true` for index scales so dendrogram branches can
meet connector midpoints while retaining row alignment, padding, and zoom.
Fractional positions are supported by WebGL, Canvas/SVG, and experimental WebGPU.
Fractional positioning is disabled by default, and locus positioning is unchanged.
Experimental WebGPU index scales now apply reversed band and alignment offsets
consistently with Core's other renderers. GPU interval-selection predicates
explicitly reject fractional index channels.
