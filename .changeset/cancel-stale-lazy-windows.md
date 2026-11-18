---
"@genome-spy/core": patch
---

<!-- category: fix -->

Cancel obsolete fixed-window reads when the viewport moves, even while the next
read waits for debounce. Keep reads that still cover the viewport.

Skip queued reads when the current window size no longer allows detail, and
clear the loading indicator when a reload is skipped.
