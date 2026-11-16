---
"@genome-spy/core": patch
---

<!-- category: fix -->

Cancel obsolete fixed-window reads when the viewport moves, even while the next
request is waiting for debounce. Keep reads that still cover the viewport.
