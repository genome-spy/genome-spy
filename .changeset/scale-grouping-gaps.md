---
"@genome-spy/core": minor
---

Add fixed-size grouping gaps to positional index and locus scales with flat
`gapPositions` and `gapWidth` properties, including chromosome boundaries and
reactive configuration that redraws immediately. Gaps retain their CSS pixel
widths during navigation; half-open interval endpoints and interval selection
use the same boundaries across WebGL, WebGPU, Canvas, and SVG rendering.
