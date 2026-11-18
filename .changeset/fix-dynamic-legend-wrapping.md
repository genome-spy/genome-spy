---
"@genome-spy/core": patch
---

<!-- category: fix -->

Fix wrapped legend layout when the set of active legends changes.

Hiding or showing a legend no longer reuses row positions from the previous
legend list, preventing layout errors between layout passes.
