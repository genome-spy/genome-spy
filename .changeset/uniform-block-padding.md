---
"@genome-spy/core": patch
---

Fix WebGL initialization errors on affected Mali GPUs, including the Pixel 9a,
by supplying trailing uniform-buffer padding expected by TWGL.
