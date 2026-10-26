---
"@genome-spy/core": patch
---

<!-- category: fix -->

Restore hover highlighting and single-point selection in views that share a
selection through `push: "outer"`, including after the selection is replaced or
cleared through the embedding API. Hover highlighting now follows the pointer
between marks without the previous view clearing the new highlight.
