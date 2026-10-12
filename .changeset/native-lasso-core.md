---
"@genome-spy/core": minor
"@genome-spy/app-agent": patch
---

Add `select: "region"` lasso selections for quantitative scatterplots, including
nonlinear scales, linked views with shared IDs, and membership preserved through
zoom and pan. The embedding API exposes selected rows and captured polygon intent.

The experimental WebGPU renderer computes live membership while drawing and offers
an opt-in density display. WebGL and Canvas use the separate CPU reference on
release. Agent view summaries recognize region selection declarations.
