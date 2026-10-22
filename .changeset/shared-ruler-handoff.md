---
"@genome-spy/core": patch
---

<!-- category: fix -->

Keep a shared ruler cursor active when the pointer moves directly between plots
that push to the same parameter. Leaving the previous plot no longer clears the
coordinate just published by the new plot.
