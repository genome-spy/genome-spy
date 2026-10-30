---
"@genome-spy/core": patch
---

<!-- category: fix -->

Preserve point fills beneath translucent and invisible inward strokes in SVG
exports and Canvas2D rendering. Opaque strokes retain their existing rendering
path, and stroke outlines keep their existing geometry.
