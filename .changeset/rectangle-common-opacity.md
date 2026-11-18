---
"@genome-spy/core": patch
---

<!-- category: fix -->

Apply rectangle opacity once after combining its fill, border and shadow.
Explicit `fillOpacity` and `strokeOpacity` values now multiply with `opacity`.
