---
"@genome-spy/core": minor
"@genome-spy/app": minor
"@genome-spy/app-agent": minor
---

Add `select: "region"` lasso selections for quantitative scatterplots, including
nonlinear scales, linked views with shared IDs, and membership preserved through
zoom and pan. App bookmarks and undo/redo store polygon intent and replay it against
current data. Agent parameter actions accept the same replayable region value.

The experimental WebGPU renderer computes live membership while drawing and offers
an opt-in density display. WebGL and Canvas materialize the separate CPU reference
on release. CPU bookmark replay can differ from GPU membership near boundaries.
