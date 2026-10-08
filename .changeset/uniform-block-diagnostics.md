---
"@genome-spy/core": patch
---

Pad WebGL uniform buffers when a device reports their size without trailing
padding, avoiding initialization errors on affected Mali GPUs. Log uniform-block
declarations and reported GPU layouts if initialization still fails.
