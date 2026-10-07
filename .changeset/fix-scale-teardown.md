---
"@genome-spy/core": patch
---

Fix renderer switching freezing the playground for visualizations whose scale
domains reference another scale, such as the sashimi plot example. Replacing or
removing these visualizations no longer produces an "Unknown scale channel"
error during cleanup.
